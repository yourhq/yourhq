#!/usr/bin/env bash
set -euo pipefail
AGENT_NAME="${1:-}"
[ -z "$AGENT_NAME" ] && echo "Usage: ~/update-agent.sh <n>" && exit 1
WORKSPACE="$HOME/.openclaw/workspace-${AGENT_NAME}"
REPO_DIR="$HOME/.openclaw/repo.git"
[ ! -d "$WORKSPACE" ] && echo "ERROR: Not found." && exit 1
git -C "$REPO_DIR" fetch origin
cd "$WORKSPACE" && git pull origin "$AGENT_NAME"
openclaw gateway restart
echo "✓ '$AGENT_NAME' updated."
