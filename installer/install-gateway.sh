#!/usr/bin/env bash
# =============================================================================
# HQ gateway installer (remote host).
#
# Run from the UI's onboarding flow:
#   curl -fsSL https://raw.githubusercontent.com/yourhq/yourhq/main/installer/install-gateway.sh \
#     | GATEWAY_TOKEN=... SUPABASE_URL=... [GATEWAY_LABEL=...] [TAILSCALE_AUTH_KEY=...] bash
#
# Required env:
#   GATEWAY_TOKEN              single-use token the UI minted (15 min TTL)
#   SUPABASE_URL               the project's URL (public)
#   SUPABASE_ANON_KEY          public anon key — used by the gateway to
#                              call consume_gateway_token() on boot
#   SUPABASE_SERVICE_ROLE_KEY  embedded into .env so this gateway can
#                              talk to the project's REST/Realtime APIs
#                              after token exchange. Stays on the
#                              remote host — never sent to Supabase.
#
# Optional env:
#   GATEWAY_LABEL        friendly name (default: hostname)
#   TAILSCALE_AUTH_KEY   Tailscale reusable auth key if you want this gateway
#                        on your tailnet (strongly recommended for remote
#                        access — the UI can only reach this machine if it's
#                        on the same tailnet or LAN)
#   TAILSCALE_EXIT_NODE  Tailscale IP to route egress through
#   INSTALL_DIR          where to clone + stash .env (default: $HOME/.yourhq-gateway)
# =============================================================================
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/.yourhq-gateway}"
GATEWAY_LABEL="${GATEWAY_LABEL:-$(hostname -s 2>/dev/null || echo gateway)}"

B="\033[1m"; D="\033[2m"; R="\033[0m"
G="\033[32m"; Y="\033[33m"; RED="\033[31m"
say()  { printf "%b\n" "$*"; }
ok()   { printf "  %b✓%b %s\n" "$G" "$R" "$*"; }
warn() { printf "  %b⚠%b %s\n" "$Y" "$R" "$*"; }
err()  { printf "  %b✗%b %s\n" "$RED" "$R" "$*" >&2; }

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    err "$name is required. This script is meant to be invoked from the HQ onboarding UI, which sets it for you."
    exit 1
  fi
}

require_env GATEWAY_TOKEN
require_env SUPABASE_URL
require_env SUPABASE_ANON_KEY
require_env SUPABASE_SERVICE_ROLE_KEY

say ""
say "${B}HQ gateway installer${R}"
say "${D}This will install Docker (if missing) and start the agent runtime on this machine.${R}"
say ""

# ── Docker preflight ────────────────────────────────────────────
need_docker=0
if ! command -v docker >/dev/null 2>&1; then
  need_docker=1
elif ! docker info >/dev/null 2>&1; then
  need_docker=1
fi

if [ "$need_docker" = "1" ]; then
  case "$(uname -s)" in
    Linux)
      say "${B}Installing Docker…${R}"
      local_sh="sh"
      if [ "$(id -u)" -ne 0 ]; then
        if command -v sudo >/dev/null 2>&1; then
          local_sh="sudo sh"
        else
          err "Need root or sudo to install Docker on Linux."
          exit 1
        fi
      fi
      curl -fsSL https://get.docker.com | $local_sh
      ok "Docker installed"
      ;;
    Darwin)
      err "Docker Desktop for Mac isn't installed. Install it from https://www.docker.com/products/docker-desktop and re-run this command."
      exit 1
      ;;
    *)
      err "Unsupported OS: $(uname -s). Install Docker manually and re-run."
      exit 1
      ;;
  esac
fi

ok "Docker is available"

# ── Fetch compose files ────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

GH_AUTH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$GH_AUTH_TOKEN" ] && command -v gh >/dev/null 2>&1; then
  GH_AUTH_TOKEN="$(gh auth token 2>/dev/null || true)"
fi
CURL_AUTH=()
if [ -n "$GH_AUTH_TOKEN" ]; then
  CURL_AUTH=(-H "Authorization: Bearer $GH_AUTH_TOKEN")
fi
REPO_RAW="${YOURHQ_REPO_RAW:-https://raw.githubusercontent.com/yourhq/yourhq/main}"

if [ ! -f "docker-compose.yml" ]; then
  if ! curl -fsSL "${CURL_AUTH[@]}" "$REPO_RAW/docker-compose.yml" -o docker-compose.yml; then
    err "Couldn't fetch $REPO_RAW/docker-compose.yml"
    exit 1
  fi
  ok "Fetched docker-compose.yml"
fi

# ── Compute a gateway slug from the label (matches server-side RPC) ──
GATEWAY_SLUG="$(printf "%s" "$GATEWAY_LABEL" | tr '[:upper:]' '[:lower:]' \
  | sed 's/[^a-z0-9]\+/-/g; s/^-\|-$//g' | head -c 32)"
GATEWAY_SLUG="${GATEWAY_SLUG:-gateway}"

# ── Write .env ────────────────────────────────────────────────
cat > .env <<ENVEOF
COMPOSE_PROJECT=yourhq-gateway
SUPABASE_URL=${SUPABASE_URL}
# Anon key: used by entrypoint.sh to call consume_gateway_token()
# on first boot. Public-by-design.
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
# Service role: read/write access to the project's REST + Realtime
# APIs. The UI minted this one-liner with this key embedded so the
# remote gateway has full project access after the token exchange.
# Stays on this host's filesystem — never sent back to Supabase.
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
GATEWAY_TOKEN=${GATEWAY_TOKEN}
GATEWAY_LABEL=${GATEWAY_LABEL}
GATEWAY_ID=${GATEWAY_SLUG}
TAILSCALE_AUTH_KEY=${TAILSCALE_AUTH_KEY:-}
TAILSCALE_EXIT_NODE=${TAILSCALE_EXIT_NODE:-}
NOVNC_BIND=${NOVNC_BIND:-local}
ENVEOF
chmod 600 .env
ok "Wrote .env at $INSTALL_DIR/.env"

# ── Pull + start only the gateway profile ─────────────────────
say ""
say "${B}Starting gateway (first-time image pull, this may take a minute)…${R}"
docker compose --profile gateway pull
docker compose --profile gateway up -d
ok "Gateway services started"

say ""
say "${G}${B}Done.${R}"
say "${D}Your gateway is booting and will register with HQ shortly.${R}"
say "${D}Switch back to the HQ onboarding tab — it'll auto-detect the new gateway within a few seconds.${R}"
say ""
