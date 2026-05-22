#!/usr/bin/env bash
set -euo pipefail

# Fresh install test — runs on a clean machine via SSH.
# Usage: ./install-test.sh <ssh-target> [ssh-key-path]
#
# Validates:
#   1. Installer downloads and runs without error
#   2. Docker is installed (or was already present)
#   3. UI container starts and responds on :3000
#   4. .env file is generated with required variables
#   5. docker-compose.yml is fetched

SSH_TARGET="${1:?Usage: install-test.sh <user@host> [key-path]}"
SSH_KEY="${2:-${E2E_SSH_KEY_PATH:-}}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
[[ -n "$SSH_KEY" ]] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

PASS=0
FAIL=0

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }

rcmd() { ssh $SSH_OPTS "$SSH_TARGET" "$@"; }

echo "=== HQ Fresh Install Test ==="
echo "Target: $SSH_TARGET"
echo ""

# Pre-flight
echo "Pre-flight:"
if rcmd "echo ok" >/dev/null 2>&1; then
  pass "SSH connection"
else
  fail "SSH connection"
  echo "Cannot reach target. Aborting."
  exit 1
fi

docker_before=$(rcmd "docker --version 2>/dev/null && echo 'yes' || echo 'no'")
echo "  Docker pre-installed: $docker_before"

# Run installer
echo ""
echo "Running installer..."
install_output=$(rcmd "curl -fsSL https://install.yourhq.ai | bash" 2>&1) || true
echo "$install_output" | tail -5

# Validate
echo ""
echo "Post-install checks:"

if rcmd "docker --version >/dev/null 2>&1"; then
  pass "Docker available"
else
  fail "Docker not available after install"
fi

if rcmd "docker compose version >/dev/null 2>&1"; then
  pass "Docker Compose available"
else
  fail "Docker Compose not available"
fi

yourhq_home=$(rcmd "echo \${YOURHQ_HOME:-\$HOME/.yourhq}")

if rcmd "test -f $yourhq_home/docker-compose.yml"; then
  pass "docker-compose.yml exists"
else
  fail "docker-compose.yml not found"
fi

if rcmd "test -f $yourhq_home/.env"; then
  pass ".env file generated"
else
  fail ".env file not generated"
fi

# Check .env has required vars
for var in COMPOSE_PROJECT IMAGE_TAG GATEWAY_AUTH_TOKEN; do
  if rcmd "grep -q '^${var}=' $yourhq_home/.env 2>/dev/null"; then
    pass ".env contains $var"
  else
    fail ".env missing $var"
  fi
done

# Check UI container
echo ""
echo "UI container:"
if rcmd "docker compose -f $yourhq_home/docker-compose.yml ps --format json 2>/dev/null | grep -q ui"; then
  pass "UI container exists"
else
  fail "UI container not found"
fi

echo ""
echo "Waiting for UI to respond (up to 90s)..."
for i in $(seq 1 18); do
  if rcmd "curl -sf http://localhost:3000 >/dev/null 2>&1"; then
    pass "UI responding on port 3000 (after $((i*5))s)"
    break
  fi
  if [[ $i -eq 18 ]]; then
    fail "UI did not respond within 90s"
  fi
  sleep 5
done

# Summary
echo ""
echo "=== Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC} ==="
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
