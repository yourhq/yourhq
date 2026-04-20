#!/usr/bin/env bash
set -euo pipefail

AGENT_NAME=""
BOT_TOKEN=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --token) BOT_TOKEN="$2"; shift 2 ;;
    --help|-h) echo "Usage: ~/add-agent.sh <branch> --token <token>"; exit 0 ;;
    *) AGENT_NAME="$1"; shift ;;
  esac
done
[ -z "$AGENT_NAME" ] && echo "Usage: ~/add-agent.sh <branch> --token <token>" && exit 1
[ -z "$BOT_TOKEN" ] && echo "ERROR: --token required." && exit 1

CONFIG="$HOME/.openclaw/openclaw.json"
REPO_DIR="$HOME/.openclaw/repo.git"
WORKSPACE="$HOME/.openclaw/workspace-${AGENT_NAME}"
[ ! -f "$CONFIG" ] && echo "ERROR: $CONFIG not found." && exit 1
[ ! -d "$REPO_DIR" ] && echo "ERROR: Repo not found." && exit 1

echo "══════════════════════════════════════════"
echo "  Adding agent: $AGENT_NAME"
echo "══════════════════════════════════════════"

# Fetch + worktree
git -C "$REPO_DIR" fetch origin
if [ -d "$WORKSPACE" ]; then
  echo "→ Workspace exists, pulling..."
  cd "$WORKSPACE" && git pull origin "$AGENT_NAME"
else
  echo "→ Creating git worktree..."
  git -C "$REPO_DIR" worktree add "$WORKSPACE" "origin/$AGENT_NAME"
  cd "$WORKSPACE"
  git checkout -B "$AGENT_NAME" "origin/$AGENT_NAME"
  git branch --set-upstream-to="origin/$AGENT_NAME" "$AGENT_NAME"
fi

cd "$WORKSPACE"
git config user.email "openclaw-${AGENT_NAME}@agent.local"
git config user.name "OpenClaw ($AGENT_NAME)"
git config push.default current

# Read agent.json
AGENT_JSON="$WORKSPACE/agent.json"
[ ! -f "$AGENT_JSON" ] && echo "ERROR: No agent.json in branch '$AGENT_NAME'" && exit 1
AGENT_DISPLAY_NAME=$(jq -r '.name // empty' "$AGENT_JSON")
AGENT_MODEL=$(jq -r '.model // "openai-codex/gpt-4o"' "$AGENT_JSON")
BROWSER_PROFILE=$(jq -r '.browserProfile // empty' "$AGENT_JSON")
BROWSER_COLOR=$(jq -r '.browserColor // "#FF4500"' "$AGENT_JSON")
[ -z "$AGENT_DISPLAY_NAME" ] && AGENT_DISPLAY_NAME="$AGENT_NAME"
echo "  Name: $AGENT_DISPLAY_NAME | Model: $AGENT_MODEL | Browser: ${BROWSER_PROFILE:-none}"

# CDP port
CDP_PORT=""
if [ -n "$BROWSER_PROFILE" ]; then
  USED_PORTS=$(jq -r '.browser.profiles // {} | to_entries[] | .value.cdpPort // empty' "$CONFIG" 2>/dev/null)
  CDP_PORT=18801
  while echo "$USED_PORTS" | grep -q "^${CDP_PORT}$"; do CDP_PORT=$((CDP_PORT + 1)); done
  [ "$CDP_PORT" -eq 18800 ] && CDP_PORT=18803
fi

# Derive simple slug for Telegram account ID (strip workspace prefix)
# e.g., "flight-recap/marco" → "marco", "marco" → "marco"
TG_ACCOUNT_ID="${AGENT_NAME##*/}"

# Update config
TEMP=$(mktemp)
jq \
  --arg id "$AGENT_NAME" --arg name "$AGENT_DISPLAY_NAME" --arg workspace "$WORKSPACE" \
  --arg model "$AGENT_MODEL" --arg bp "$BROWSER_PROFILE" --arg bc "$BROWSER_COLOR" \
  --arg botToken "$BOT_TOKEN" --arg tgAccount "$TG_ACCOUNT_ID" \
  --argjson cdpPort "${CDP_PORT:-null}" \
'
  .agents.list //= [] |
  .agents.list = [.agents.list[] | select(.id != $id)] + [{
    id: $id, name: $name, workspace: $workspace, model: $model
  } + (if $bp != "" then {browserProfile: $bp} else {} end)] |
  (if $bp != "" and $cdpPort != null then .browser.profiles[$bp] = {cdpPort: $cdpPort, color: $bc} else . end) |
  .channels.telegram.accounts //= {} |
  .channels.telegram.accounts[$tgAccount] = { botToken: $botToken } |
  .bindings //= [] |
  .bindings = [.bindings[] | select(.agentId != $id)] + [{agentId: $id, match: {channel: "telegram", accountId: $tgAccount}}]
' "$CONFIG" > "$TEMP" && mv "$TEMP" "$CONFIG"

# Desktop shortcut
if [ -n "$BROWSER_PROFILE" ] && [ -n "$CDP_PORT" ]; then
  mkdir -p "$HOME/Desktop"
  cat > "$HOME/Desktop/Chrome-${AGENT_NAME}.desktop" << SHORTCUT
[Desktop Entry]
Version=1.0
Type=Application
Name=Chrome (${AGENT_DISPLAY_NAME})
Exec=/usr/bin/google-chrome-stable --user-data-dir=$HOME/.openclaw/browser/${BROWSER_PROFILE}/user-data --remote-debugging-port=${CDP_PORT}
Icon=google-chrome
Terminal=false
SHORTCUT
  chmod +x "$HOME/Desktop/Chrome-${AGENT_NAME}.desktop"
fi

# Symlink shared auth so this agent inherits the global OAuth credentials.
# openclaw stores model auth per-agent; we keep one canonical copy in
# ~/.openclaw/shared-auth/ and symlink every agent to it.
AGENT_DIR_ID=$(echo "$AGENT_NAME" | tr '/' '-')
AGENT_AUTH_DIR="$HOME/.openclaw/agents/${AGENT_DIR_ID}/agent"
SHARED_AUTH="$HOME/.openclaw/shared-auth"
if [ -d "$SHARED_AUTH" ] && [ -f "$SHARED_AUTH/auth-profiles.json" ]; then
  mkdir -p "$AGENT_AUTH_DIR"
  ln -sf "$SHARED_AUTH/auth-profiles.json" "$AGENT_AUTH_DIR/auth-profiles.json"
  [ -f "$SHARED_AUTH/auth-state.json" ] && \
    ln -sf "$SHARED_AUTH/auth-state.json" "$AGENT_AUTH_DIR/auth-state.json"
  echo "→ Linked shared auth for $AGENT_NAME"
fi

openclaw gateway restart
echo "✓ Agent '$AGENT_NAME' added. Pair: openclaw pairing approve telegram <CODE>"
