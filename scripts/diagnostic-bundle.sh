#!/usr/bin/env bash
# =============================================================================
# Diagnostic bundle — collects system info, service status, and recent logs
# into a tarball for support/debugging.
#
# Usage:
#   bash scripts/diagnostic-bundle.sh
#   # or from Docker:
#   docker compose exec runner bash /app/scripts/diagnostic-bundle.sh
#
# Output: yourhq-diagnostic-<timestamp>.tar.gz in the current directory.
# =============================================================================
set -euo pipefail

TS=$(date -u +%Y%m%dT%H%M%SZ)
BUNDLE_DIR=$(mktemp -d)
OUT="yourhq-diagnostic-${TS}.tar.gz"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-yourhq}"

collect() {
  local name="$1"
  shift
  echo "  collecting ${name}..."
  "$@" > "${BUNDLE_DIR}/${name}" 2>&1 || echo "(command failed)" >> "${BUNDLE_DIR}/${name}"
}

echo "Collecting diagnostic info..."

collect "uname.txt"        uname -a
collect "docker-version.txt" docker version
collect "docker-compose-version.txt" docker compose version
collect "disk.txt"         df -h
collect "memory.txt"       free -h 2>/dev/null || vm_stat 2>/dev/null || echo "N/A"

collect "compose-ps.txt"   docker compose -p "${COMPOSE_PROJECT}" ps -a
collect "compose-config.txt" docker compose -p "${COMPOSE_PROJECT}" config --no-interpolate 2>/dev/null || echo "N/A"

for svc in ui gateway dispatcher runner; do
  container="${COMPOSE_PROJECT}-${svc}"
  collect "logs-${svc}.txt"   docker logs --tail 500 "${container}" 2>&1 || true
  collect "inspect-${svc}.txt" docker inspect "${container}" 2>&1 || true
done

collect "volumes.txt" docker volume ls --filter "name=${COMPOSE_PROJECT}"

if command -v tailscale &>/dev/null; then
  collect "tailscale-status.txt" tailscale status
fi

echo "---" > "${BUNDLE_DIR}/env-sanitized.txt"
echo "COMPOSE_PROJECT=${COMPOSE_PROJECT}" >> "${BUNDLE_DIR}/env-sanitized.txt"
for var in SUPABASE_URL GATEWAY_ID GATEWAY_LABEL NOVNC_BIND NETWORKING_MODE RUNTIME_MODE; do
  val="${!var:-<unset>}"
  echo "${var}=${val}" >> "${BUNDLE_DIR}/env-sanitized.txt"
done

tar -czf "${OUT}" -C "${BUNDLE_DIR}" .
rm -rf "${BUNDLE_DIR}"

echo ""
echo "Bundle written to: ${OUT}"
echo "Share this file when reporting issues. It does NOT contain secrets."
