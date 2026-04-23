#!/usr/bin/env bash
# =============================================================================
# HQ — one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/yourhq/yourhq/main/installer/install.sh | bash
#
# Installs Docker (on Linux if missing), downloads the compose file, and
# starts ONLY the UI. Everything else — Supabase, networking, Tailscale,
# whether to run the gateway here or on another machine — is asked in
# the browser as part of onboarding.
#
# Total download: ~200 MB. First-time boot: ~30 seconds.
# =============================================================================
set -euo pipefail

if [ -t 1 ]; then
  B="\033[1m"; D="\033[2m"; R="\033[0m"
  G="\033[32m"; Y="\033[33m"; RED="\033[31m"; C="\033[36m"
else
  B=""; D=""; R=""; G=""; Y=""; RED=""; C=""
fi

say()  { printf "%b\n" "$*"; }
info() { printf "  %b%s%b\n" "$C" "$*" "$R"; }
ok()   { printf "  %b✓%b %s\n" "$G" "$R" "$*"; }
warn() { printf "  %b⚠%b %s\n" "$Y" "$R" "$*"; }
err()  { printf "  %b✗%b %s\n" "$RED" "$R" "$*" >&2; }

say ""
say "${B}HQ installer${R}"
say "${D}Install HQ and start the UI. Onboarding continues in the browser.${R}"
say ""

# ── Docker preflight ────────────────────────────────────────
install_docker_linux() {
  info "Installing Docker via get.docker.com…"
  local sh_cmd="sh"
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      sh_cmd="sudo sh"
    else
      err "Need root or sudo to install Docker."
      exit 1
    fi
  fi
  curl -fsSL https://get.docker.com | $sh_cmd
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    sudo usermod -aG docker "$USER" || true
    warn "Added $USER to the 'docker' group. You may need to re-login or run 'newgrp docker'."
  fi
  ok "Docker installed"
}

if ! command -v docker >/dev/null 2>&1; then
  case "$(uname -s)" in
    Linux)
      warn "Docker is not installed on this machine."
      install_docker_linux
      ;;
    Darwin)
      err "Docker Desktop isn't installed. Get it at https://www.docker.com/products/docker-desktop and re-run this command."
      exit 1
      ;;
    *)
      err "Unsupported OS $(uname -s) — install Docker manually and re-run."
      exit 1
      ;;
  esac
fi

if ! docker compose version >/dev/null 2>&1; then
  err "The 'docker compose' plugin is not available."
  say "  Install the Compose plugin: ${C}https://docs.docker.com/compose/install/${R}"
  exit 1
fi

ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) + Compose $(docker compose version --short 2>/dev/null || echo unknown)"

# ── Target directory ────────────────────────────────────────
TARGET="${YOURHQ_HOME:-$HOME/.yourhq}"
mkdir -p "$TARGET"
cd "$TARGET"

REPO_RAW="${YOURHQ_REPO_RAW:-https://raw.githubusercontent.com/yourhq/yourhq/main}"

# Auth for private-repo raw fetches. In order of preference:
#   1) Explicit GH_TOKEN / GITHUB_TOKEN (the user passed one in)
#   2) `gh auth token` (logged-in gh CLI — standard in Codespaces)
#   3) Nothing — works for public repos
GH_AUTH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$GH_AUTH_TOKEN" ] && command -v gh >/dev/null 2>&1; then
  GH_AUTH_TOKEN="$(gh auth token 2>/dev/null || true)"
fi

CURL_AUTH=()
if [ -n "$GH_AUTH_TOKEN" ]; then
  CURL_AUTH=(-H "Authorization: Bearer $GH_AUTH_TOKEN")
fi

# If the user ran the installer from inside a clone of the repo, prefer
# the local checkout over a remote fetch. This makes `bash installer/install.sh`
# "just work" in Codespaces regardless of repo visibility.
LOCAL_COMPOSE=""
for candidate in \
  "$(pwd)/docker-compose.yml" \
  "$(dirname "$0")/../docker-compose.yml"; do
  if [ -f "$candidate" ]; then
    LOCAL_COMPOSE="$candidate"
    break
  fi
done

if [ ! -f "docker-compose.yml" ]; then
  if [ -n "$LOCAL_COMPOSE" ] && [ "$LOCAL_COMPOSE" != "$TARGET/docker-compose.yml" ]; then
    cp "$LOCAL_COMPOSE" docker-compose.yml
    ok "Copied local docker-compose.yml"
  else
    info "Fetching compose file…"
    if ! curl -fsSL "${CURL_AUTH[@]}" "$REPO_RAW/docker-compose.yml" -o docker-compose.yml; then
      err "Couldn't fetch $REPO_RAW/docker-compose.yml"
      if [ -z "$GH_AUTH_TOKEN" ]; then
        say "  The repo may be private. Try one of these:"
        say "    ${C}export GH_TOKEN=\$(gh auth token) && bash installer/install.sh${R}"
        say "    ${C}cp <your-checkout>/docker-compose.yml ~/.yourhq/ && bash installer/install.sh${R}"
      else
        say "  Auth header was sent but the fetch still failed — double-check the token has read access."
      fi
      exit 1
    fi
    ok "Fetched docker-compose.yml"
  fi
fi

# ── Minimal .env ───────────────────────────────────────────
# The UI doesn't need Supabase creds at boot — the user pastes them in
# the browser during onboarding. We still write a GATEWAY_AUTH_TOKEN so
# the files-API has a secret, even though the gateway profile isn't
# running yet.
if [ ! -f ".env" ]; then
  GATEWAY_AUTH_TOKEN_VAL=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')
  cat > .env <<ENVEOF
COMPOSE_PROJECT=yourhq
GATEWAY_AUTH_TOKEN=$GATEWAY_AUTH_TOKEN_VAL
# Supabase creds come from the browser onboarding flow and are written
# to the /config volume. The UI reads them at runtime; gateway services
# inherit them from the same volume when they start.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# Host-network defaults. Onboarding offers to upgrade these to Tailscale
# or public via Settings → Networking. Staying loopback-only is safe.
UI_HOST_PORT=127.0.0.1:3000
NOVNC_HOST_PORT=127.0.0.1:6901
FILES_API_HOST_PORT=127.0.0.1:18790
NOVNC_BIND=local
ENVEOF
  chmod 600 .env
  ok "Wrote $TARGET/.env"
fi

# ── Pull + start only the UI ───────────────────────────────
say ""
info "Pulling UI image…"
docker compose pull ui
info "Starting UI…"
docker compose up -d ui

# ── Wait for UI ────────────────────────────────────────────
info "Waiting for UI to come online…"
UI_OK=0
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:3000/" -o /dev/null 2>&1; then UI_OK=1; break; fi
  sleep 2
done

say ""
if [ "$UI_OK" = 1 ]; then
  ok "UI is ready at ${C}http://localhost:3000${R}"
else
  warn "UI hasn't responded yet — check: ${C}docker compose logs -f ui${R}"
fi

say ""
say "${B}What's next?${R}"
say "  • The rest of setup happens in your browser."
say "  • Decide where agents run (this machine vs another)."
say "  • Connect your Supabase project — we'll install the schema for you."
say ""
say "${D}Open ${C}http://localhost:3000${R}${D} to continue.${R}"
say ""

if command -v open >/dev/null 2>&1; then
  open "http://localhost:3000" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" >/dev/null 2>&1 || true
fi

say "${G}✓ Done.${R}"
