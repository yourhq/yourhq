#!/usr/bin/env bash
set -euo pipefail

# Tear down an HQ installation for clean re-test.
# Usage: ./teardown.sh [ssh-target] [ssh-key-path]
# Without ssh-target, runs locally.

SSH_TARGET="${1:-}"
SSH_KEY="${2:-${E2E_SSH_KEY_PATH:-}}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
[[ -n "$SSH_KEY" ]] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY"

rcmd() {
  if [[ -n "$SSH_TARGET" ]]; then
    ssh $SSH_OPTS "$SSH_TARGET" "$@"
  else
    eval "$@"
  fi
}

echo "=== HQ Teardown ==="

YOURHQ_HOME=$(rcmd "echo \${YOURHQ_HOME:-\$HOME/.yourhq}")

echo "Stopping containers..."
rcmd "cd $YOURHQ_HOME && docker compose --profile gateway down -v 2>/dev/null" || true

echo "Removing install directory..."
rcmd "rm -rf $YOURHQ_HOME" || true

echo "Pruning Docker resources..."
rcmd "docker system prune -f 2>/dev/null" || true

echo "Done. Instance is clean for a fresh install."
