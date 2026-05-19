#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# HQ updater — checks for new releases and upgrades in place.
#
# Usage:
#   ./update.sh              # interactive: shows changelog, asks to confirm
#   ./update.sh --yes        # non-interactive: apply immediately
#   ./update.sh --check      # just print current vs latest, don't update
# ─────────────────────────────────────────────────────────────

REPO="yourhq/yourhq"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
ENV_FILE=".env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { printf "${GREEN}▸${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}▸${NC} %s\n" "$*"; }
err()   { printf "${RED}✗${NC} %s\n" "$*" >&2; }

get_current_version() {
  if [ -f "$ENV_FILE" ]; then
    grep '^IMAGE_TAG=' "$ENV_FILE" 2>/dev/null | sed 's/^IMAGE_TAG=//' | head -1 || echo "latest"
  else
    echo "latest"
  fi
}

get_latest_version() {
  local response
  response=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null) || {
    err "Failed to check for updates (network error or no releases yet)"
    exit 1
  }
  echo "$response" | grep -o '"tag_name":[^,]*' | head -1 | sed 's/.*"tag_name":[[:space:]]*"//;s/"//'
}

get_release_body() {
  local tag="$1"
  curl -fsSL "https://api.github.com/repos/${REPO}/releases/tags/${tag}" 2>/dev/null \
    | grep -o '"body":[^}]*' | head -1 | sed 's/.*"body":[[:space:]]*"//;s/"[[:space:]]*$//' \
    | sed 's/\\n/\n/g; s/\\r//g' \
    | head -20
}

# ─── Parse args ─────────────────────────────────────────────

AUTO_YES=false
CHECK_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --yes|-y)   AUTO_YES=true ;;
    --check|-c) CHECK_ONLY=true ;;
    --help|-h)
      echo "Usage: ./update.sh [--yes] [--check]"
      echo "  --yes, -y     Apply update without confirmation"
      echo "  --check, -c   Only check for updates, don't apply"
      exit 0
      ;;
    *) err "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ─── Main ───────────────────────────────────────────────────

current=$(get_current_version)
info "Current version: ${current}"

latest=$(get_latest_version)
info "Latest release:  ${latest}"

if [ "$current" = "$latest" ] || [ "v${current}" = "$latest" ]; then
  info "Already up to date."
  exit 0
fi

echo ""
warn "Update available: ${current} → ${latest}"
echo ""

release_notes=$(get_release_body "$latest")
if [ -n "$release_notes" ]; then
  echo "Release notes:"
  echo "────────────────────────────────────────"
  echo "$release_notes"
  echo "────────────────────────────────────────"
  echo ""
fi

if [ "$CHECK_ONLY" = true ]; then
  exit 0
fi

if [ "$AUTO_YES" = false ]; then
  printf "Apply update? [y/N] "
  read -r confirm
  if [[ ! "$confirm" =~ ^[Yy] ]]; then
    info "Update cancelled."
    exit 0
  fi
fi

# ─── Apply update ───────────────────────────────────────────

version_without_v="${latest#v}"

info "Updating IMAGE_TAG to ${version_without_v} ..."
if [ -f "$ENV_FILE" ] && grep -q "^IMAGE_TAG=" "$ENV_FILE"; then
  sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=${version_without_v}/" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"
else
  echo "IMAGE_TAG=${version_without_v}" >> "$ENV_FILE"
fi

info "Pulling new images ..."
docker compose -f "$COMPOSE_FILE" pull

info "Restarting services ..."
docker compose -f "$COMPOSE_FILE" up -d

info "Running migrations ..."
docker compose -f "$COMPOSE_FILE" exec -T ui npx yourhq-migrate 2>/dev/null || {
  warn "Migration runner not available in container — run manually if needed:"
  warn "  docker compose exec ui npx yourhq-migrate"
}

echo ""
info "Update complete: now running ${latest}"
info "Check status: docker compose ps"
