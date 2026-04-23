#!/usr/bin/env bash
# =============================================================================
# HQ — interactive installer for self-hosted HQ.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/yourhq/yourhq/main/installer/install.sh | bash
#
# Or clone the repo and run ./installer/install.sh directly.
#
# Prompts for Supabase creds, networking preference (Tailscale / public /
# local), optional exit node, and optional templates source. Writes .env,
# brings up the stack, opens the browser.
# =============================================================================
set -euo pipefail

# ── Colors + helpers ────────────────────────────────────────
if [ -t 1 ]; then
  B="\033[1m"; D="\033[2m"; R="\033[0m"
  G="\033[32m"; Y="\033[33m"; RED="\033[31m"; C="\033[36m"
else
  B=""; D=""; R=""; G=""; Y=""; RED=""; C=""
fi

say()   { printf "%b\n" "$*"; }
info()  { printf "  %b%s%b\n" "$C" "$*" "$R"; }
ok()    { printf "  %b✓%b %s\n" "$G" "$R" "$*"; }
warn()  { printf "  %b⚠%b %s\n" "$Y" "$R" "$*"; }
err()   { printf "  %b✗%b %s\n" "$RED" "$R" "$*" >&2; }

ask() {
  # ask <prompt> <default> [secret]
  local prompt="$1" default="${2:-}" secret="${3:-}"
  local reply
  if [ -n "$default" ]; then
    printf "%b%s%b [%s]: " "$B" "$prompt" "$R" "$default"
  else
    printf "%b%s%b: " "$B" "$prompt" "$R"
  fi
  if [ "$secret" = "secret" ]; then
    read -rs reply < /dev/tty
    printf "\n"
  else
    read -r reply < /dev/tty
  fi
  echo "${reply:-$default}"
}

choose() {
  # choose <prompt> <default-number> <opt1> <opt2> ...
  local prompt="$1" default="$2"; shift 2
  local i=1
  printf "%b%s%b\n" "$B" "$prompt" "$R"
  for opt in "$@"; do
    printf "  %d) %s\n" "$i" "$opt"
    i=$((i+1))
  done
  local reply
  printf "Pick [%s]: " "$default"
  read -r reply < /dev/tty
  reply="${reply:-$default}"
  echo "$reply"
}

# ── Preflight ────────────────────────────────────────────────
say ""
say "${B}HQ installer${R}"
say "${D}Self-host setup — clone, configure, run.${R}"
say ""

install_docker_linux() {
  info "Installing Docker via get.docker.com ..."
  local sh_cmd="sh"
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      sh_cmd="sudo sh"
    else
      err "Need root or sudo to install Docker. Re-run as root or install Docker manually."
      exit 1
    fi
  fi
  curl -fsSL https://get.docker.com | $sh_cmd
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    sudo usermod -aG docker "$USER" || true
    warn "Added $USER to the 'docker' group. You may need to re-login or run 'newgrp docker' for the group change to take effect in new shells."
  fi
  ok "Docker installed"
}

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker is not installed on this machine."
  OS_NAME="$(uname -s)"
  if [ "$OS_NAME" = "Linux" ]; then
    say ""
    say "  HQ runs on Docker. On Linux I can install it for you via the"
    say "  official get.docker.com script — it covers all major distros."
    say ""
    REPLY=$(ask "Install Docker now? [Y/n]" "Y")
    case "$REPLY" in
      [Nn]*)
        err "Docker is required. Install it manually and re-run this script."
        say "  ${C}https://docs.docker.com/engine/install/${R}"
        exit 1
        ;;
      *)
        install_docker_linux
        ;;
    esac
  elif [ "$OS_NAME" = "Darwin" ]; then
    say ""
    say "  ${B}You're on macOS.${R} Docker on Mac runs inside Docker Desktop,"
    say "  a GUI app that can't be installed from a shell script."
    say ""
    say "  ${B}What to do:${R}"
    say "    1. Download Docker Desktop: ${C}https://docs.docker.com/desktop/install/mac-install/${R}"
    say "    2. Open the .dmg and drag Docker to Applications"
    say "    3. Launch Docker Desktop (wait for the whale icon in the menu bar)"
    say "    4. Re-run this installer"
    say ""
    exit 1
  else
    say ""
    say "  ${B}You're on $OS_NAME.${R} Docker on Windows runs inside Docker Desktop,"
    say "  which requires WSL2 and can't be installed from this script."
    say ""
    say "  ${B}What to do:${R}"
    say "    1. Install WSL2: ${C}https://learn.microsoft.com/windows/wsl/install${R}"
    say "    2. Install Docker Desktop: ${C}https://docs.docker.com/desktop/install/windows-install/${R}"
    say "    3. Launch Docker Desktop (wait for the whale icon in the system tray)"
    say "    4. Re-run this installer from a WSL shell"
    say ""
    exit 1
  fi
fi
if ! docker compose version >/dev/null 2>&1; then
  err "docker compose plugin is not available."
  say "Install the Compose plugin: ${C}https://docs.docker.com/compose/install/${R}"
  exit 1
fi
ok "Docker $(docker --version | awk '{print $3}' | tr -d ,)"
ok "Compose $(docker compose version --short 2>/dev/null || echo unknown)"

# ── Target directory ────────────────────────────────────────
say ""
TARGET="${YOURHQ_HOME:-$HOME/.yourhq}"
if [ ! -d "$TARGET" ]; then
  mkdir -p "$TARGET"
  ok "Created install directory at $TARGET"
else
  info "Using existing install directory at $TARGET"
fi
cd "$TARGET"

# Fetch compose files + env example from the repo if we're running via curl.
REPO_RAW="${YOURHQ_REPO_RAW:-https://raw.githubusercontent.com/yourhq/yourhq/main}"
CURL_AUTH=()
if [ -n "${GH_TOKEN:-}" ]; then
  CURL_AUTH=(-H "Authorization: Bearer $GH_TOKEN")
fi
if [ ! -f "docker-compose.yml" ]; then
  info "Downloading compose files ..."
  curl -fsSL "${CURL_AUTH[@]}" "$REPO_RAW/docker-compose.yml" -o docker-compose.yml
  curl -fsSL "${CURL_AUTH[@]}" "$REPO_RAW/.env.example" -o .env.example
  ok "Downloaded"
fi

# Gateway auth token — shared secret between UI and gateway files-API.
# Generated automatically. Also serves as the secret the user never has
# to touch.
GATEWAY_AUTH_TOKEN_VAL=$(openssl rand -hex 32)

# Supabase creds are no longer collected here. The UI onboards the user
# in the browser and writes them to a shared volume; the gateway reads
# from there on first boot. This keeps install to one command.
SUPABASE_URL_VAL=""
SUPABASE_SERVICE_ROLE_KEY_VAL=""
WORKSPACE_SLUG_VAL=""

# ── Networking ──────────────────────────────────────────────
say ""
say "${B}1. Networking${R}"
say "${D}HQ can run local-only (just this machine), or over Tailscale so you${R}"
say "${D}can reach it from other devices and later add remote gateways.${R}"
say ""

NET_CHOICE=$(choose "How do you want to access HQ?" 1 \
  "Local-only — http://localhost:3000 on this machine (default, simplest)" \
  "Tailscale  — reachable from any device on your tailnet (install Tailscale now)" \
  "Public HTTPS — expose this host on a public domain (advanced)")

NETWORKING_MODE_VAL="local"
HOST_REACHABLE_URL_VAL="http://localhost"
UI_HOST_PORT_VAL="127.0.0.1:3000"
NOVNC_HOST_PORT_VAL="127.0.0.1:6901"
FILES_API_HOST_PORT_VAL="127.0.0.1:18790"

case "$NET_CHOICE" in
  2)
    NETWORKING_MODE_VAL="tailscale"
    say ""
    info "Tailscale selected."
    say "${D}  1. Create a free account at https://tailscale.com if you haven't.${R}"
    say "${D}  2. Generate a reusable auth key (toggle 'Reusable' on):${R}"
    say "${D}     https://login.tailscale.com/admin/settings/keys${R}"
    say "${D}  3. Paste the tskey-auth-… string below.${R}"
    say ""
    TS_KEY=$(ask "Tailscale auth key" "" secret)
    if [ -z "$TS_KEY" ]; then
      warn "No auth key provided — falling back to local-only."
      NETWORKING_MODE_VAL="local"
    else
      # Install Tailscale on the HOST (not in any container).
      if ! command -v tailscale >/dev/null 2>&1; then
        info "Installing Tailscale on this host ..."
        curl -fsSL https://tailscale.com/install.sh | sh
      else
        ok "Tailscale already installed."
      fi
      info "Bringing up Tailscale ..."
      if command -v sudo >/dev/null 2>&1; then
        sudo tailscale up --authkey="$TS_KEY" --hostname="yourhq-$(hostname)" --accept-routes
      else
        tailscale up --authkey="$TS_KEY" --hostname="yourhq-$(hostname)" --accept-routes
      fi
      # Read back the host's Tailscale IP.
      HOST_TS_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
      if [ -z "$HOST_TS_IP" ]; then
        warn "Couldn't read Tailscale IP after 'tailscale up' — did it succeed? Falling back to local."
        NETWORKING_MODE_VAL="local"
      else
        ok "Host Tailscale IP: $HOST_TS_IP"
        HOST_REACHABLE_URL_VAL="http://$HOST_TS_IP"
        UI_HOST_PORT_VAL="0.0.0.0:3000"
        NOVNC_HOST_PORT_VAL="0.0.0.0:6901"
        FILES_API_HOST_PORT_VAL="0.0.0.0:18790"
        say ""
        EXIT_ANS=$(ask "Route outbound traffic through a residential-IP exit node? [y/N]" "N")
        if [[ "$EXIT_ANS" =~ ^[Yy]$ ]]; then
          say "${D}  See https://tailscale.com/kb/1103/exit-nodes for setting up an exit node.${R}"
          TS_EXIT=$(ask "Exit node Tailscale IP (e.g. 100.64.0.5)" "")
          if [ -n "$TS_EXIT" ]; then
            if command -v sudo >/dev/null 2>&1; then
              sudo tailscale set --exit-node="$TS_EXIT" --exit-node-allow-lan-access || warn "exit-node set failed (node must be approved + advertised as exit node)"
            else
              tailscale set --exit-node="$TS_EXIT" --exit-node-allow-lan-access || warn "exit-node set failed"
            fi
          fi
        fi
      fi
    fi
    ;;
  3)
    NETWORKING_MODE_VAL="public"
    say ""
    info "Public HTTPS selected."
    warn "Public mode requires a host-level reverse proxy (Caddy, Traefik, nginx)"
    warn "with TLS in front of ports 3000 (UI), 6901 (noVNC), and 18790 (files-API)."
    warn "HQ no longer runs Caddy inside the gateway container — configure your"
    warn "reverse proxy separately. See docs/PUBLIC_DEPLOY.md (TODO)."
    PUB_DOMAIN=$(ask "Your domain (e.g. hq.example.com)" "")
    if [ -z "$PUB_DOMAIN" ]; then
      warn "No domain provided — falling back to local-only."
      NETWORKING_MODE_VAL="local"
    else
      HOST_REACHABLE_URL_VAL="https://$PUB_DOMAIN"
      UI_HOST_PORT_VAL="0.0.0.0:3000"
      NOVNC_HOST_PORT_VAL="0.0.0.0:6901"
      FILES_API_HOST_PORT_VAL="0.0.0.0:18790"
    fi
    ;;
  1 | *)
    info "Local-only selected — HQ reachable at http://localhost:3000."
    ;;
esac

# ── Templates ───────────────────────────────────────────────
say ""
say "${B}2. Templates${R}"
say "${D}The gateway ships with a library of agent templates (cofounder, designer, etc.).${R}"
TEMPLATES_SOURCE_VAL=""
TPL_ANS=$(ask "Use the bundled templates? [Y/n]" "Y")
if [[ "$TPL_ANS" =~ ^[Nn]$ ]]; then
  TEMPLATES_SOURCE_VAL=$(ask "Custom templates source (git+<url>)" "")
fi

# ── GitHub sync ─────────────────────────────────────────────
say ""
say "${B}3. GitHub sync (optional)${R}"
say "${D}Every per-agent branch can auto-push to a GitHub repo so your${R}"
say "${D}agents' memory and skills are backed up. Leave blank to skip.${R}"
GITHUB_TOKEN_VAL=""
GITHUB_REPO_OWNER_VAL=""
GITHUB_REPO_NAME_VAL=""
GITHUB_ANS=$(ask "Set up GitHub sync? [y/N]" "N")
if [[ "$GITHUB_ANS" =~ ^[Yy]$ ]]; then
  say "${D}Create a fine-grained PAT at https://github.com/settings/tokens?type=beta${R}"
  say "${D}  Repository access: the single repo you want to sync to${R}"
  say "${D}  Permissions: Contents -> Read and write${R}"
  GITHUB_TOKEN_VAL=$(ask "GitHub token (ghp_... or github_pat_...)" "" secret)
  GITHUB_REPO_OWNER_VAL=$(ask "Repo owner (user or org)" "")
  GITHUB_REPO_NAME_VAL=$(ask "Repo name" "")
  if [ -z "$GITHUB_TOKEN_VAL" ] || [ -z "$GITHUB_REPO_OWNER_VAL" ] || [ -z "$GITHUB_REPO_NAME_VAL" ]; then
    warn "Missing token or repo details — skipping GitHub sync."
    GITHUB_TOKEN_VAL=""
    GITHUB_REPO_OWNER_VAL=""
    GITHUB_REPO_NAME_VAL=""
  fi
fi

# ── Write .env ──────────────────────────────────────────────
say ""
say "${B}4. Writing .env${R}"

cat > .env << ENV_EOF
SUPABASE_URL=$SUPABASE_URL_VAL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY_VAL
WORKSPACE_SLUG=$WORKSPACE_SLUG_VAL
GATEWAY_ID=default
GATEWAY_LABEL=Primary gateway
COMPOSE_PROJECT=yourhq
GATEWAY_AUTH_TOKEN=$GATEWAY_AUTH_TOKEN_VAL

# Networking — controlled by the host, not the containers.
NETWORKING_MODE=$NETWORKING_MODE_VAL
HOST_REACHABLE_URL=$HOST_REACHABLE_URL_VAL
UI_HOST_PORT=$UI_HOST_PORT_VAL
NOVNC_HOST_PORT=$NOVNC_HOST_PORT_VAL
FILES_API_HOST_PORT=$FILES_API_HOST_PORT_VAL

NOVNC_BIND=local
VNC_PASSWORD=
TEMPLATES_SOURCE=$TEMPLATES_SOURCE_VAL
GIT_REMOTE_URL=
GIT_DEPLOY_KEY=
GITHUB_TOKEN=$GITHUB_TOKEN_VAL
GITHUB_REPO_OWNER=$GITHUB_REPO_OWNER_VAL
GITHUB_REPO_NAME=$GITHUB_REPO_NAME_VAL
EMBEDDING_API_KEY=
POLL_INTERVAL=30
COMMAND_TIMEOUT=120
GIT_SYNC_INTERVAL=1800
RECONCILE_INTERVAL=60
WAKE_COOLDOWN=30
ENV_EOF
chmod 600 .env
ok "Wrote $TARGET/.env"

# ── Pull and start ──────────────────────────────────────────
say ""
say "${B}5. Starting services${R}"
info "Pulling images (first run takes a few minutes) ..."
docker compose pull || warn "Some images could not be pulled — will try to build locally."

info "Starting full stack (UI + gateway + dispatcher + runner) ..."
# The gateway services wait for you to complete Supabase onboarding in
# the UI; they'll log "waiting for onboarding" until you do, then
# auto-pick up the creds from the shared ui-config volume. No .env
# edit, no second docker compose up.
docker compose up -d

# ── Health wait ─────────────────────────────────────────────
info "Waiting for UI to become reachable on localhost:3000 ..."
UI_OK=0
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:3000/" -o /dev/null 2>&1; then UI_OK=1; break; fi
  sleep 2
done

say ""
if [ "$UI_OK" = 1 ]; then
  ok "UI is up at ${C}http://localhost:3000${R}"
else
  warn "UI hasn't responded yet. Check logs with: ${C}docker compose logs -f ui${R}"
fi

# ── Final summary ───────────────────────────────────────────
say ""
say "${B}Next steps${R}"
say "  • Open ${C}http://localhost:3000${R} in your browser."
say "  • Complete the workspace setup wizard."
say "  • Add your first agent from the UI."
say ""
say "${B}Useful commands${R}"
say "  ${D}cd $TARGET${R}"
say "  ${D}docker compose logs -f${R}        # tail all logs"
say "  ${D}docker compose restart${R}        # restart everything"
say "  ${D}docker compose down${R}           # stop stack (keeps state)"
say ""

# Try to open the browser
if command -v open >/dev/null 2>&1; then
  open "http://localhost:3000" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" >/dev/null 2>&1 || true
fi

say "${G}✓ Done.${R}"
