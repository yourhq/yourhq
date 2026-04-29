#!/usr/bin/env bash
set -euo pipefail
AGENT_NAME="${1:-}"
[ -z "$AGENT_NAME" ] && echo "Usage: ~/remove-agent.sh <name>" && exit 1
CONFIG="$HOME/.openclaw/openclaw.json"
REPO_DIR="$HOME/.openclaw/repo.git"
TG_ACCOUNT_ID="${AGENT_NAME##*/}"
TEMP=$(mktemp)
jq --arg id "$AGENT_NAME" --arg tgAccount "$TG_ACCOUNT_ID" '
  .agents.list = [.agents.list[] | select(.id != $id)] |
  if .channels.telegram.accounts[$tgAccount] then del(.channels.telegram.accounts[$tgAccount]) else . end |
  .bindings = [.bindings[] | select(.agentId != $id)]
' "$CONFIG" > "$TEMP" && mv "$TEMP" "$CONFIG"
BROWSER_PROFILE="${AGENT_NAME##*/}"
rm -f "$HOME/.openclaw/Desktop/Chrome-${BROWSER_PROFILE}.desktop"
WORKSPACE="$HOME/.openclaw/workspace-${AGENT_NAME}"
[ -d "$WORKSPACE" ] && git -C "$REPO_DIR" worktree remove "$WORKSPACE" --force 2>/dev/null || true
openclaw gateway restart
echo "✓ Agent '$AGENT_NAME' removed."
