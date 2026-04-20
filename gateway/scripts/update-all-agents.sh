#!/usr/bin/env bash
set -euo pipefail
CONFIG="$HOME/.openclaw/openclaw.json"
REPO_DIR="$HOME/.openclaw/repo.git"
git -C "$REPO_DIR" fetch origin
for AGENT in $(jq -r '.agents.list[]?.id // empty' "$CONFIG"); do
  W="$HOME/.openclaw/workspace-${AGENT}"
  [ -d "$W" ] && { echo "→ $AGENT..."; cd "$W" && git pull origin "$AGENT" 2>/dev/null || echo "  ⚠ failed"; }
done
openclaw gateway restart
echo "✓ All updated."
