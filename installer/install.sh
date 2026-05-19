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
DOCKER="docker"

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
    DOCKER="sudo docker"
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

if ! $DOCKER compose version >/dev/null 2>&1; then
  err "The 'docker compose' plugin is not available."
  say "  Install the Compose plugin: ${C}https://docs.docker.com/compose/install/${R}"
  exit 1
fi

ok "Docker $($DOCKER --version | awk '{print $3}' | tr -d ,) + Compose $($DOCKER compose version --short 2>/dev/null || echo unknown)"

# ── Target directory ────────────────────────────────────────
TARGET="${YOURHQ_HOME:-$HOME/.yourhq}"
mkdir -p "$TARGET"
cd "$TARGET"

# Resolve latest release tag (falls back to main if no releases exist yet)
YOURHQ_VERSION="${YOURHQ_VERSION:-}"
if [ -z "$YOURHQ_VERSION" ]; then
  YOURHQ_VERSION=$(curl -fsSL "https://api.github.com/repos/yourhq/yourhq/releases/latest" 2>/dev/null \
    | grep -o '"tag_name":[^,]*' | head -1 | sed 's/.*"tag_name":[[:space:]]*"//;s/"//' || echo "main")
fi
info "Version: $YOURHQ_VERSION"

REPO_RAW="${YOURHQ_REPO_RAW:-https://raw.githubusercontent.com/yourhq/yourhq/${YOURHQ_VERSION}}"

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

# Fetch update script
if [ ! -f "update.sh" ]; then
  curl -fsSL "${CURL_AUTH[@]}" "$REPO_RAW/update.sh" -o update.sh 2>/dev/null && chmod +x update.sh && \
    ok "Fetched update.sh" || true
fi

# ── Minimal .env ───────────────────────────────────────────
# The UI doesn't need Supabase creds at boot — the user pastes them in
# the browser during onboarding. We still write a GATEWAY_AUTH_TOKEN so
# the files-API has a secret, even though the gateway profile isn't
# running yet.
if [ ! -f ".env" ]; then
  GATEWAY_AUTH_TOKEN_VAL=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n')
  # Pin to the installed version (strip leading "v" for docker tags)
  PIN_TAG="${YOURHQ_VERSION#v}"
  [ "$PIN_TAG" = "main" ] && PIN_TAG="latest"
  cat > .env <<ENVEOF
COMPOSE_PROJECT=yourhq
IMAGE_TAG=$PIN_TAG
GATEWAY_AUTH_TOKEN=$GATEWAY_AUTH_TOKEN_VAL
# Supabase creds come from the browser onboarding flow and are written
# to the /config volume. The UI reads them at runtime; gateway services
# inherit them from the same volume when they start.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# Host-network defaults. Onboarding offers to upgrade these to Tailscale
# or public via Settings → Networking. Staying loopback-only is safe.
UI_HOST_PORT=0.0.0.0:3000
NOVNC_HOST_PORT=127.0.0.1:6901
FILES_API_HOST_PORT=127.0.0.1:18790
NOVNC_BIND=local
ENVEOF
  chmod 600 .env
  ok "Wrote $TARGET/.env"
fi

# ── GHCR auth ─────────────────────────────────────────────
# Try an unauthenticated pull first (works for public packages).
# If that fails and we have a GH token, log in and retry.
# If no token is available, prompt the user.
say ""
info "Pulling UI image…"
if ! $DOCKER compose pull ui 2>/dev/null; then
  if [ -n "$GH_AUTH_TOKEN" ]; then
    info "Image pull failed — authenticating to ghcr.io…"
    echo "$GH_AUTH_TOKEN" | $DOCKER login ghcr.io -u "token" --password-stdin 2>/dev/null && \
      ok "Logged in to ghcr.io" || { err "GHCR login failed. Check your token has read:packages scope."; exit 1; }
    $DOCKER compose pull ui || { err "Image pull failed even after login."; exit 1; }
  else
    say ""
    err "Image pull failed — the package may be private."
    say "  Set a GitHub token with ${C}read:packages${R} scope and re-run:"
    say "    ${C}export GH_TOKEN=ghp_xxxx${R}"
    say "    ${C}bash installer/install.sh${R}"
    say ""
    say "  Create a token at: ${C}https://github.com/settings/tokens/new?scopes=read:packages${R}"
    exit 1
  fi
fi
ok "Image pulled"
info "Starting UI…"
$DOCKER compose up -d ui

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
  warn "UI hasn't responded yet — check: ${C}$DOCKER compose logs -f ui${R}"
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
