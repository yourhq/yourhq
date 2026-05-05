#!/usr/bin/env bash
# Quick-start dev mode. Auto-detects public hostname (EC2, VPS) so
# remote browser access works without manual ALLOWED_ORIGINS config.
#
# Usage:
#   bash scripts/dev.sh              # UI only
#   bash scripts/dev.sh --gateway    # UI + gateway services
set -euo pipefail

cd "$(dirname "$0")/.."

# ── Auto-detect public hostname ──────────────────────────────
PUBLIC_HOST=""

# EC2 instance metadata (IMDSv1)
if [ -z "$PUBLIC_HOST" ]; then
  PUBLIC_HOST=$(curl -s --connect-timeout 1 http://169.254.169.254/latest/meta-data/public-hostname 2>/dev/null || echo "")
fi

# Fallback: hostname -f on the host
if [ -z "$PUBLIC_HOST" ]; then
  PUBLIC_HOST=$(hostname -f 2>/dev/null || echo "")
fi

# Write to .env if not already there
if [ -n "$PUBLIC_HOST" ]; then
  if grep -q "^ALLOWED_ORIGINS=" .env 2>/dev/null; then
    if ! grep -q "$PUBLIC_HOST" .env; then
      CURRENT=$(grep "^ALLOWED_ORIGINS=" .env | cut -d= -f2-)
      sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=${CURRENT},${PUBLIC_HOST}|" .env
    fi
  else
    echo "ALLOWED_ORIGINS=${PUBLIC_HOST}" >> .env
  fi
  echo "  ✓ Allowed origin: $PUBLIC_HOST"
fi

# ── Start services ───────────────────────────────────────────
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

if [ "${1:-}" = "--gateway" ]; then
  $COMPOSE --profile gateway up -d --pull always --no-build
else
  $COMPOSE up -d ui
fi

echo ""
echo "  UI: http://${PUBLIC_HOST:-localhost}:3000"
echo ""
$COMPOSE logs -f ui
