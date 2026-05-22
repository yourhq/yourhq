#!/usr/bin/env bash
set -euo pipefail

# Health checks for a running HQ instance.
# Usage: ./health-checks.sh [ssh-target]
# If ssh-target is provided, runs checks remotely. Otherwise runs locally.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}!${NC} $1"; ((WARN++)); }

run_cmd() {
  if [[ -n "${SSH_TARGET:-}" ]]; then
    ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
        ${SSH_KEY:+-i "$SSH_KEY"} "$SSH_TARGET" "$@"
  else
    eval "$@"
  fi
}

SSH_TARGET="${1:-}"
SSH_KEY="${E2E_SSH_KEY_PATH:-}"

echo "=== HQ Health Checks ==="
echo ""

# Docker
echo "Docker:"
if run_cmd "docker info >/dev/null 2>&1"; then
  pass "Docker daemon running"
else
  fail "Docker daemon not running"
fi

# Containers
echo ""
echo "Containers:"
containers=$(run_cmd "docker compose ps --format json 2>/dev/null" || echo "")
if [[ -z "$containers" ]]; then
  fail "No compose services found"
else
  while IFS= read -r line; do
    name=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('Name','?'))" 2>/dev/null || echo "?")
    state=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('State','?'))" 2>/dev/null || echo "?")
    health=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('Health',''))" 2>/dev/null || echo "")

    if [[ "$state" == "running" ]]; then
      if [[ "$health" == "unhealthy" ]]; then
        warn "$name: running but unhealthy"
      else
        pass "$name: $state"
      fi
    else
      fail "$name: $state"
    fi
  done <<< "$containers"
fi

# UI
echo ""
echo "Services:"
if run_cmd "curl -sf http://localhost:3000 >/dev/null 2>&1"; then
  pass "UI (port 3000) responding"
else
  fail "UI (port 3000) not responding"
fi

# Files API
if run_cmd "curl -sf http://localhost:18790/healthz >/dev/null 2>&1"; then
  pass "Files API (port 18790) responding"
else
  warn "Files API (port 18790) not responding (may not be started yet)"
fi

# Embedder
if run_cmd "curl -sf http://localhost:18801/healthz >/dev/null 2>&1"; then
  pass "Embedder (port 18801) responding"
else
  warn "Embedder (port 18801) not responding (may still be loading model)"
fi

# noVNC
if run_cmd "curl -sf http://localhost:6901 >/dev/null 2>&1"; then
  pass "noVNC (port 6901) responding"
else
  warn "noVNC (port 6901) not responding"
fi

# Error scan
echo ""
echo "Log scan (last 5 minutes):"
error_count=$(run_cmd "docker compose logs --since 5m 2>/dev/null | grep -ci 'error\|traceback\|exception' || echo 0")
if [[ "$error_count" -eq 0 ]]; then
  pass "No errors in recent logs"
elif [[ "$error_count" -lt 5 ]]; then
  warn "$error_count error-like lines in recent logs"
else
  fail "$error_count error-like lines in recent logs"
fi

# Disk
echo ""
echo "Resources:"
disk_pct=$(run_cmd "df / --output=pcent 2>/dev/null | tail -1 | tr -d '% '" || echo "0")
if [[ "$disk_pct" -lt 80 ]]; then
  pass "Disk usage: ${disk_pct}%"
elif [[ "$disk_pct" -lt 90 ]]; then
  warn "Disk usage: ${disk_pct}%"
else
  fail "Disk usage: ${disk_pct}%"
fi

# Summary
echo ""
echo "=== Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC} ==="
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
