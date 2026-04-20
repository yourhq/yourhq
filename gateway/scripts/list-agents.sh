#!/usr/bin/env bash
set -euo pipefail
CONFIG="$HOME/.openclaw/openclaw.json"
REPO_DIR="$HOME/.openclaw/repo.git"
echo "══════════ Deployed ══════════"
jq -r '.agents.list // [] | .[] | "  \(.id)\t\(.name // .id)\t\(if .default then "[PRIMARY]" else "" end)"' "$CONFIG" | column -t -s $'\t'
echo ""
if [ -d "$REPO_DIR" ]; then
  git -C "$REPO_DIR" fetch origin --quiet 2>/dev/null
  DEPLOYED=$(jq -r '.agents.list[]?.id // empty' "$CONFIG")
  echo "══════════ Available ══════════"
  for B in $(git -C "$REPO_DIR" branch -r | grep 'origin/' | sed 's|origin/||' | tr -d ' ' | grep -v '^HEAD'); do
    echo "$DEPLOYED" | grep -q "^${B}$" || echo "  $B"
  done
  echo ""
fi
