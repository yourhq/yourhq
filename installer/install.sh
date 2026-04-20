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

if ! command -v docker >/dev/null 2>&1; then
  err "Docker is not installed."
  say ""
  say "Install Docker first, then re-run this script:"
  say "  • macOS / Windows: ${C}https://docs.docker.com/desktop/${R}"
  say "  • Linux:           ${C}https://docs.docker.com/engine/install/${R}"
  exit 1
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
REPO_RAW="https://raw.githubusercontent.com/yourhq/yourhq/main"
if [ ! -f "docker-compose.yml" ]; then
  info "Downloading compose files ..."
  curl -fsSL "$REPO_RAW/docker-compose.yml" -o docker-compose.yml
  curl -fsSL "$REPO_RAW/.env.example" -o .env.example
  ok "Downloaded"
fi

# ── Supabase ────────────────────────────────────────────────
say ""
say "${B}1. Supabase${R}"
say "${D}Create a free project at https://supabase.com, then paste the values below.${R}"
say "${D}Find them under Project Settings → API.${R}"
say ""

SUPABASE_URL_VAL=$(ask "Supabase project URL" "")
NEXT_PUBLIC_SUPABASE_ANON_KEY_VAL=$(ask "Supabase anon key" "" secret)
SUPABASE_SERVICE_ROLE_KEY_VAL=$(ask "Supabase service role key" "" secret)
WORKSPACE_SLUG_VAL=$(ask "Workspace slug (short, no spaces)" "my-workspace")

if [ -z "$SUPABASE_URL_VAL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY_VAL" ]; then
  err "Supabase URL and service role key are required."
  exit 1
fi

# ── Networking ──────────────────────────────────────────────
say ""
say "${B}2. Networking${R}"
say "${D}How do you want to reach the gateway's browser desktop from your laptop?${R}"
say ""

NET_CHOICE=$(choose "Choose networking path:" 1 \
  "Tailscale  — private mesh network (recommended)" \
  "Public HTTPS — expose the gateway on a public domain" \
  "Local-only — no remote access (I'll tunnel myself)")

TAILSCALE_AUTH_KEY_VAL=""
TAILSCALE_EXIT_NODE_VAL=""
NOVNC_BIND_VAL="local"
NOVNC_DOMAIN_VAL=""
NOVNC_HOST_PORT_VAL="127.0.0.1:6901"

case "$NET_CHOICE" in
  1)
    say ""
    info "Tailscale selected."
    say "${D}  1. Create a free account at https://tailscale.com (if you haven't).${R}"
    say "${D}  2. Generate a reusable auth key:${R}"
    say "${D}     https://login.tailscale.com/admin/settings/keys${R}"
    say "${D}     Toggle 'Reusable' on. Copy the tskey-auth-… string.${R}"
    say "${D}  3. Paste it below.${R}"
    say ""
    TAILSCALE_AUTH_KEY_VAL=$(ask "Tailscale auth key" "" secret)
    if [ -z "$TAILSCALE_AUTH_KEY_VAL" ]; then
      warn "No auth key provided — falling back to local-only."
      NOVNC_BIND_VAL="local"
    else
      NOVNC_BIND_VAL="tailscale"
      say ""
      EXIT_ANS=$(ask "Route outbound traffic through a residential-IP exit node? [y/N]" "N")
      if [[ "$EXIT_ANS" =~ ^[Yy]$ ]]; then
        say "${D}  See https://tailscale.com/kb/1103/exit-nodes for setting up an exit node.${R}"
        say "${D}  Once it's approved in the admin console, paste its Tailscale IP here.${R}"
        TAILSCALE_EXIT_NODE_VAL=$(ask "Exit node Tailscale IP (e.g. 100.64.0.5)" "")
      fi
    fi
    ;;
  2)
    say ""
    info "Public HTTPS selected."
    NOVNC_DOMAIN_VAL=$(ask "Public domain for the gateway (e.g. gw.example.com)" "")
    if [ -z "$NOVNC_DOMAIN_VAL" ]; then
      warn "No domain provided — falling back to local-only."
      NOVNC_BIND_VAL="local"
    else
      NOVNC_BIND_VAL="public"
      NOVNC_HOST_PORT_VAL="0.0.0.0:6901"
      warn "Point the domain's DNS A/AAAA record at this host before starting."
      warn "Make sure ports 80 and 443 are open (Caddy uses them for Let's Encrypt)."
    fi
    ;;
  3 | *)
    info "Local-only selected. noVNC will bind to 127.0.0.1:6901."
    NOVNC_BIND_VAL="local"
    ;;
esac

# ── Templates ───────────────────────────────────────────────
say ""
say "${B}3. Templates${R}"
say "${D}The gateway ships with a library of agent templates (cofounder, designer, etc.).${R}"
TEMPLATES_SOURCE_VAL=""
TPL_ANS=$(ask "Use the bundled templates? [Y/n]" "Y")
if [[ "$TPL_ANS" =~ ^[Nn]$ ]]; then
  TEMPLATES_SOURCE_VAL=$(ask "Custom templates source (git+<url>)" "")
fi

# ── Write .env ──────────────────────────────────────────────
say ""
say "${B}4. Writing .env${R}"

cat > .env << ENV_EOF
SUPABASE_URL=$SUPABASE_URL_VAL
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL_VAL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY_VAL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY_VAL
WORKSPACE_SLUG=$WORKSPACE_SLUG_VAL
GATEWAY_ID=default
GATEWAY_LABEL=Primary gateway
COMPOSE_PROJECT=yourhq
UI_PORT=3000
TAILSCALE_AUTH_KEY=$TAILSCALE_AUTH_KEY_VAL
TAILSCALE_EXIT_NODE=$TAILSCALE_EXIT_NODE_VAL
NOVNC_BIND=$NOVNC_BIND_VAL
NOVNC_DOMAIN=$NOVNC_DOMAIN_VAL
CADDY_EMAIL=
NOVNC_HOST_PORT=$NOVNC_HOST_PORT_VAL
VNC_PASSWORD=
TEMPLATES_SOURCE=$TEMPLATES_SOURCE_VAL
GIT_REMOTE_URL=
GIT_DEPLOY_KEY=
GITHUB_TOKEN=
GITHUB_REPO_OWNER=
GITHUB_REPO_NAME=
EMBEDDING_API_KEY=
POLL_INTERVAL=30
COMMAND_TIMEOUT=120
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

info "Starting stack ..."
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
