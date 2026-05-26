#!/usr/bin/env bash
# =============================================================================
# Add (or re-provision) an agent.
#
# In the monorepo/Docker architecture the UI no longer creates the per-agent
# git branch itself — this script does. It:
#
#   1. Creates <branch> (default "<workspace>/<slug>") off <source-branch>
#      (default "default") if the branch doesn't already exist.
#   2. Patches agent.json with the wizard inputs (slug, name, description,
#      emoji, telegram_token_env).
#   3. Fills in USER.md placeholder tokens from the owner profile.
#   4. Commits the init patches so future `git pull`s are clean.
#   5. Checks out the branch as a worktree.
#   6. Patches openclaw.json with the agent's entry + telegram binding.
#   7. Links the shared auth profile so this agent inherits Codex OAuth.
#   8. Restarts the gateway so the new agent is picked up.
#
# Usage:
#   ~/add-agent.sh <branch> \
#     --token <telegram-bot-token> \
#     [--source-branch <template-branch-or-default>] \
#     [--slug <agent-slug>] \
#     [--name <display-name>] \
#     [--description <text>] \
#     [--emoji <emoji>] \
#     [--owner-name <name>] \
#     [--owner-preferred-name <name>] \
#     [--owner-timezone <tz>]
#
# Any optional flag can be omitted — defaults fall back to existing branch
# content or placeholder values.
# =============================================================================
set -euo pipefail

AGENT_NAME=""
CHANNEL="telegram"
BOT_TOKEN=""
DISCORD_TOKEN=""
DISCORD_SERVER_ID=""
DISCORD_USER_ID=""
SLACK_APP_TOKEN=""
SLACK_BOT_TOKEN=""
SOURCE_BRANCH=""
AGENT_SLUG=""
AGENT_DISPLAY_NAME=""
AGENT_DESCRIPTION=""
AGENT_EMOJI=""
AGENT_MODEL_ARG=""
OWNER_NAME=""
OWNER_PREFERRED_NAME=""
OWNER_TIMEZONE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --channel)               CHANNEL="$2"; shift 2 ;;
    --token)                 BOT_TOKEN="$2"; shift 2 ;;
    --telegram-token)        BOT_TOKEN="$2"; shift 2 ;;
    --discord-token)         DISCORD_TOKEN="$2"; shift 2 ;;
    --discord-server-id)     DISCORD_SERVER_ID="$2"; shift 2 ;;
    --discord-user-id)       DISCORD_USER_ID="$2"; shift 2 ;;
    --slack-app-token)       SLACK_APP_TOKEN="$2"; shift 2 ;;
    --slack-bot-token)       SLACK_BOT_TOKEN="$2"; shift 2 ;;
    --source-branch)         SOURCE_BRANCH="$2"; shift 2 ;;
    --slug)                  AGENT_SLUG="$2"; shift 2 ;;
    --name)                  AGENT_DISPLAY_NAME="$2"; shift 2 ;;
    --description)           AGENT_DESCRIPTION="$2"; shift 2 ;;
    --emoji)                 AGENT_EMOJI="$2"; shift 2 ;;
    --owner-name)            OWNER_NAME="$2"; shift 2 ;;
    --owner-preferred-name)  OWNER_PREFERRED_NAME="$2"; shift 2 ;;
    --model)                 AGENT_MODEL_ARG="$2"; shift 2 ;;
    --owner-timezone)        OWNER_TIMEZONE="$2"; shift 2 ;;
    --help|-h)
      sed -n '2,35p' "$0"
      exit 0
      ;;
    *) AGENT_NAME="$1"; shift ;;
  esac
done

[ -z "$AGENT_NAME" ] && echo "ERROR: <branch> positional arg required. See --help." && exit 1

CONFIG="$HOME/.openclaw/openclaw.json"
REPO_DIR="$HOME/.openclaw/repo.git"
WORKSPACE="$HOME/.openclaw/workspace-${AGENT_NAME}"
[ ! -f "$CONFIG" ] && echo "ERROR: $CONFIG not found." && exit 1
[ ! -d "$REPO_DIR" ] && echo "ERROR: Repo not found at $REPO_DIR." && exit 1

# Fallbacks
[ -z "$AGENT_SLUG" ] && AGENT_SLUG="${AGENT_NAME##*/}"
[ -z "$SOURCE_BRANCH" ] && SOURCE_BRANCH="default"

# Load channel tokens from secrets env (written by secrets_sync daemon)
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
SECRETS_FILE="$OPENCLAW_HOME/secrets/agents/${AGENT_SLUG}.env"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$SECRETS_FILE"
  set +a
fi
[ -z "$BOT_TOKEN" ] && BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
[ -z "$DISCORD_TOKEN" ] && DISCORD_TOKEN="${DISCORD_BOT_TOKEN:-}"

echo "══════════════════════════════════════════"
echo "  Adding agent: $AGENT_NAME"
echo "  Source:       $SOURCE_BRANCH"
echo "  Slug:         $AGENT_SLUG"
echo "  Channel:      $CHANNEL"
echo "══════════════════════════════════════════"

# ── 1. Ensure the agent's branch exists, created off the source ────────
# `git show-ref` is cheap; if the branch exists we skip the creation step.
if ! git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$AGENT_NAME"; then
  if ! git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$SOURCE_BRANCH"; then
    echo "ERROR: Source branch '$SOURCE_BRANCH' not found in $REPO_DIR."
    echo "Available branches:"
    git -C "$REPO_DIR" branch
    exit 1
  fi
  echo "→ Creating branch $AGENT_NAME off $SOURCE_BRANCH ..."
  git -C "$REPO_DIR" branch "$AGENT_NAME" "$SOURCE_BRANCH"
fi

# ── 2. Worktree (idempotent) ───────────────────────────────────────────
if [ -d "$WORKSPACE" ]; then
  echo "→ Worktree exists at $WORKSPACE, refreshing..."
  git -C "$WORKSPACE" fetch origin 2>/dev/null || true
else
  echo "→ Creating git worktree at $WORKSPACE ..."
  git -C "$REPO_DIR" worktree add "$WORKSPACE" "$AGENT_NAME"
fi

cd "$WORKSPACE"
git config user.email "openclaw-${AGENT_SLUG}@agent.local"
git config user.name "OpenClaw (${AGENT_SLUG})"
git config push.default current

# ── 3. Patch agent.json with wizard inputs ─────────────────────────────
AGENT_JSON="$WORKSPACE/agent.json"
[ ! -f "$AGENT_JSON" ] && echo "ERROR: No agent.json in $WORKSPACE — source branch is not a valid template." && exit 1

TG_TOKEN_ENV="TELEGRAM_TOKEN_$(echo "$AGENT_SLUG" | tr '[:lower:]-' '[:upper:]_')"

TMP=$(mktemp)
jq \
  --arg slug "$AGENT_SLUG" \
  --arg name "$AGENT_DISPLAY_NAME" \
  --arg desc "$AGENT_DESCRIPTION" \
  --arg emoji "$AGENT_EMOJI" \
  --arg tgEnv "$TG_TOKEN_ENV" \
  --arg channel "$CHANNEL" \
'
  .slug = $slug |
  (if $name != "" then .name = $name else . end) |
  (if $desc != "" then .description = $desc else . end) |
  (if $emoji != "" then .emoji = $emoji else . end) |
  .channel = $channel |
  (if $channel == "telegram" then .telegram_token_env = $tgEnv else . end)
' "$AGENT_JSON" > "$TMP" && mv "$TMP" "$AGENT_JSON"

# ── 4. Fill USER.md placeholder tokens if the file exists ──────────────
USER_MD="$WORKSPACE/USER.md"
if [ -f "$USER_MD" ] && [ -n "$OWNER_NAME$OWNER_PREFERRED_NAME$OWNER_TIMEZONE" ]; then
  echo "→ Populating USER.md with owner profile ..."
  python3 - "$USER_MD" "$OWNER_NAME" "$OWNER_PREFERRED_NAME" "$OWNER_TIMEZONE" << 'PYEOF'
import sys
path, name, pref, tz = sys.argv[1:5]
with open(path) as f:
    content = f.read()
if name:
    content = content.replace("USER_NAME_HERE", name)
if pref:
    content = content.replace("PREFERRED_NAME_HERE", pref)
if tz:
    content = content.replace("TIMEZONE_HERE", tz)
with open(path, "w") as f:
    f.write(content)
PYEOF
fi

# ── 4b. Replace the template's IDENTITY.md `## Name` and `## Emoji`
#      section bodies with the user-chosen values. Other sections (Role,
#      Archetype, Vibe, Creature, etc.) stay intact so the template's
#      character survives. Uses the wizard-supplied --name/--emoji CLI
#      args; if either is empty we leave the corresponding section alone.
IDENTITY_MD="$WORKSPACE/IDENTITY.md"
if [ -f "$IDENTITY_MD" ] && [ -n "$AGENT_DISPLAY_NAME$AGENT_EMOJI" ]; then
  echo "→ Populating IDENTITY.md (Name/Emoji sections) ..."
  python3 - "$IDENTITY_MD" "$AGENT_DISPLAY_NAME" "$AGENT_EMOJI" << 'PYEOF'
import re, sys
path, name, emoji = sys.argv[1:4]
with open(path) as f:
    content = f.read()

def replace_section(body, heading, value):
    # Match `## Heading\n<body>` until the next `##` or end-of-file.
    pattern = re.compile(
        rf"(^|\n)(##\s+{re.escape(heading)}\s*\n)([\s\S]*?)(?=\n##\s|\s*$)",
        re.IGNORECASE,
    )
    if not pattern.search(body):
        return body
    return pattern.sub(lambda m: f"{m.group(1)}{m.group(2)}{value}\n", body)

if name:
    content = replace_section(content, "Name", name)
if emoji:
    content = replace_section(content, "Emoji", emoji)
with open(path, "w") as f:
    f.write(content)
PYEOF
fi

# ── 4c. Swap BROWSER_PROFILE_HERE placeholder in TOOLS.md with the
#       agent's slug so the agent reads a concrete profile name it can
#       pass as `profile:` on every browser tool call.
TOOLS_MD="$WORKSPACE/TOOLS.md"
if [ -f "$TOOLS_MD" ] && grep -q "BROWSER_PROFILE_HERE" "$TOOLS_MD"; then
  echo "→ Patching TOOLS.md browser profile name ..."
  # AGENT_SLUG is the bare agent slug (matches BROWSER_PROFILE).
  python3 - "$TOOLS_MD" "$AGENT_SLUG" << 'PYEOF'
import sys
path, slug = sys.argv[1:3]
with open(path) as f:
    content = f.read()
content = content.replace("BROWSER_PROFILE_HERE", slug)
with open(path, "w") as f:
    f.write(content)
PYEOF
fi

# ── 5. Commit the initialization patches ───────────────────────────────
if ! git diff --quiet; then
  echo "→ Committing initialization patches ..."
  git add agent.json USER.md IDENTITY.md TOOLS.md 2>/dev/null || true
  git add -A
  git commit -q -m "feat: initialize agent ${AGENT_SLUG}" || true
fi

# ── 6. Read the patched manifest for downstream config ─────────────────
AGENT_NAME_DISPLAY=$(jq -r '.name // empty' "$AGENT_JSON")
AGENT_MODEL=""
if [ -n "$AGENT_MODEL_ARG" ]; then
  AGENT_MODEL="$AGENT_MODEL_ARG"
fi
if [ -z "$AGENT_MODEL" ]; then
  AGENT_MODEL=$(jq -r '.model // empty' "$AGENT_JSON")
fi
if [ -z "$AGENT_MODEL" ]; then
  AGENT_MODEL=$(jq -r '.models.default // empty' "$CONFIG" 2>/dev/null)
fi
if [ -z "$AGENT_MODEL" ]; then
  AGENT_MODEL=$(openclaw models status --json 2>/dev/null | jq -r '.[0].id // empty' 2>/dev/null || true)
fi
# Browser profile name is the bare agent slug — no workspace prefix, so
# it's filesystem-safe (used as a dir name, openclaw config key, and
# Desktop filename). Color comes from agent.json's browser_profile_color
# (snake_case, matches template manifest schema). Every agent gets a
# Chrome profile in this model — there's no opt-out.
BROWSER_PROFILE="$AGENT_SLUG"
BROWSER_COLOR=$(jq -r '.browser_profile_color // "#FF4500"' "$AGENT_JSON")
[ -z "$AGENT_NAME_DISPLAY" ] && AGENT_NAME_DISPLAY="$AGENT_SLUG"
echo "  Name: $AGENT_NAME_DISPLAY | Model: $AGENT_MODEL | Browser: $BROWSER_PROFILE"

# ── 7. Allocate a CDP port for this agent's Chrome ─────────────────────
USED_PORTS=$(jq -r '.browser.profiles // {} | to_entries[] | .value.cdpPort // empty' "$CONFIG" 2>/dev/null)
CDP_PORT=18801
while echo "$USED_PORTS" | grep -q "^${CDP_PORT}$"; do CDP_PORT=$((CDP_PORT + 1)); done
[ "$CDP_PORT" -eq 18800 ] && CDP_PORT=18803

TG_ACCOUNT_ID="${AGENT_NAME##*/}"

# ── 8. Update openclaw.json ────────────────────────────────────────────
# Note: we don't write `browserProfile` into the .agents.list[] entry —
# that produced invalid openclaw config. The profile is addressed via
# .browser.profiles[<name>] keyed on $BROWSER_PROFILE.
TMP=$(mktemp)

# Base patch: always update agent list + browser profile
BASE_JQ='
  .agents.list //= [] |
  .agents.list = [.agents.list[] | select(.id != $id)] + [{
    id: $id, name: $name, workspace: $workspace, model: $model
  }] |
  .browser.profiles[$bp] = {cdpPort: $cdpPort, color: $bc}
'

case "$CHANNEL" in
  telegram)
    jq \
      --arg id "$AGENT_NAME" --arg name "$AGENT_NAME_DISPLAY" --arg workspace "$WORKSPACE" \
      --arg model "$AGENT_MODEL" --arg bp "$BROWSER_PROFILE" --arg bc "$BROWSER_COLOR" \
      --arg botToken "$BOT_TOKEN" --arg tgAccount "$TG_ACCOUNT_ID" \
      --argjson cdpPort "$CDP_PORT" \
    "${BASE_JQ}"' |
      .channels.telegram.accounts //= {} |
      .channels.telegram.accounts[$tgAccount] = { botToken: $botToken } |
      .bindings //= [] |
      .bindings = [.bindings[] | select(.agentId != $id)] +
        [{agentId: $id, match: {channel: "telegram", accountId: $tgAccount}}]
    ' "$CONFIG" > "$TMP" && mv "$TMP" "$CONFIG"
    ;;
  discord)
    jq \
      --arg id "$AGENT_NAME" --arg name "$AGENT_NAME_DISPLAY" --arg workspace "$WORKSPACE" \
      --arg model "$AGENT_MODEL" --arg bp "$BROWSER_PROFILE" --arg bc "$BROWSER_COLOR" \
      --arg discordToken "$DISCORD_TOKEN" \
      --arg serverId "$DISCORD_SERVER_ID" --arg userId "$DISCORD_USER_ID" \
      --argjson cdpPort "$CDP_PORT" \
    "${BASE_JQ}"' |
      .channels.discord.enabled = true |
      .channels.discord.token = $discordToken |
      (if $serverId != "" and $userId != "" then
        .channels.discord.guilds[$serverId].users |= (. // []) + [$userId]
       else . end) |
      .bindings //= [] |
      .bindings = [.bindings[] | select(.agentId != $id)] +
        [{agentId: $id, match: {channel: "discord"}}]
    ' "$CONFIG" > "$TMP" && mv "$TMP" "$CONFIG"
    ;;
  slack)
    jq \
      --arg id "$AGENT_NAME" --arg name "$AGENT_NAME_DISPLAY" --arg workspace "$WORKSPACE" \
      --arg model "$AGENT_MODEL" --arg bp "$BROWSER_PROFILE" --arg bc "$BROWSER_COLOR" \
      --arg appToken "$SLACK_APP_TOKEN" --arg botToken "$SLACK_BOT_TOKEN" \
      --argjson cdpPort "$CDP_PORT" \
    "${BASE_JQ}"' |
      .channels.slack.enabled = true |
      .channels.slack.mode = "socket" |
      .channels.slack.appToken = $appToken |
      .channels.slack.botToken = $botToken |
      .bindings //= [] |
      .bindings = [.bindings[] | select(.agentId != $id)] +
        [{agentId: $id, match: {channel: "slack"}}]
    ' "$CONFIG" > "$TMP" && mv "$TMP" "$CONFIG"
    ;;
  none|*)
    jq \
      --arg id "$AGENT_NAME" --arg name "$AGENT_NAME_DISPLAY" --arg workspace "$WORKSPACE" \
      --arg model "$AGENT_MODEL" --arg bp "$BROWSER_PROFILE" --arg bc "$BROWSER_COLOR" \
      --argjson cdpPort "$CDP_PORT" \
    "${BASE_JQ}" \
    "$CONFIG" > "$TMP" && mv "$TMP" "$CONFIG"
    ;;
esac

# ── 9. Desktop shortcut for this agent's Chrome ────────────────────────
# Pre-create the user-data dir so Chrome doesn't fight the first launch.
# Shortcut lives under .openclaw/ so it's on the shared gateway-state
# volume — the gateway container symlinks ~/Desktop there at boot so
# xfdesktop picks it up.
mkdir -p "$HOME/.openclaw/Desktop" "$HOME/.openclaw/browser/${BROWSER_PROFILE}/user-data"
SHORTCUT_FILE="$HOME/.openclaw/Desktop/Chrome-${BROWSER_PROFILE}.desktop"
cat > "$SHORTCUT_FILE" << SHORTCUT
[Desktop Entry]
Version=1.0
Type=Application
Name=Chrome (${AGENT_NAME_DISPLAY})
Exec=/usr/bin/google-chrome-stable --no-sandbox --disable-dev-shm-usage --user-data-dir=$HOME/.openclaw/browser/${BROWSER_PROFILE}/user-data --remote-debugging-port=${CDP_PORT} --remote-allow-origins=* --no-first-run --no-default-browser-check
Icon=google-chrome
Terminal=false
SHORTCUT
chmod +x "$SHORTCUT_FILE"

# ── 10. Link shared auth (Codex OAuth inherited) ───────────────────────
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

# ── 11. Restart gateway to pick up new agent ───────────────────────────
# Try the service restart first (works in docker-compose setups where the
# gateway runs as a managed service). Fall back to SIGHUP on the running
# foreground process (E2B / exec-based setups).
openclaw gateway restart 2>/dev/null \
  || kill -HUP "$(pgrep -f 'openclaw gateway run' | head -1)" 2>/dev/null \
  || true
case "$CHANNEL" in
  telegram) echo "✓ Agent '$AGENT_NAME' added. Pair: openclaw pairing approve telegram <CODE>" ;;
  discord)  echo "✓ Agent '$AGENT_NAME' added. Pair: openclaw pairing approve discord <CODE>" ;;
  slack)    echo "✓ Agent '$AGENT_NAME' added. Bot is active in your Slack workspace." ;;
  none|*)   echo "✓ Agent '$AGENT_NAME' added. No channel configured." ;;
esac
