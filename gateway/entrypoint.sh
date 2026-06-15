#!/usr/bin/env bash
# =============================================================================
# Gateway container entrypoint.
#
# Idempotent — safe to run on every container start. Responsibilities:
#
#   1. Seed the bare git repo (first boot only) from the bundled templates
#      at /opt/templates, or from $TEMPLATES_SOURCE if overridden.
#   2. Optionally attach to a user-supplied git remote.
#   3. Bring up Tailscale if TAILSCALE_AUTH_KEY is set; apply exit-node
#      routing if TAILSCALE_EXIT_NODE is set.
#   4. Run `openclaw onboard` on first boot (creates openclaw.json).
#   5. Patch openclaw.json with defaults (browser path, telegram, plugins).
#   6. Install the hq-bootstrap plugin.
#   7. Start Xtigervnc + XFCE desktop on :1.
#   8. Start websockify against the VNC server, binding per $NOVNC_BIND
#      (local | public). Tailscale / TLS live on the HOST, not here.
#   9. Upsert this gateway's row in the Supabase `gateways` table so the UI
#      can see it and populate reachable URLs.
#  10. Exec `openclaw gateway run` as the container's main process.
#
# OAuth login is NOT run automatically — the UI triggers it via the command
# queue in Phase 3, or you can run it manually:
#   docker compose exec gateway openclaw models auth login \
#     --provider openai --set-default
# =============================================================================
set -euo pipefail
[[ "${DEBUG:-}" == "1" ]] && set -x

# RUNTIME_MODE controls which subsystems the entrypoint starts.
#   docker   — default. Runs inside docker-compose; daemons are separate containers.
#   systemd  — bare-metal / VM installs where systemd manages the process.
#   hosted   — cloud sandbox. Daemons run in-process; platform hooks handle URL discovery.
RUNTIME_MODE="${RUNTIME_MODE:-docker}"

# Source platform-specific init hook if present (handles HOME fixup,
# permission quirks, debug logging, etc. for the hosting provider).
if [ -f /opt/yourhq/hooks/init.sh ]; then
  source /opt/yourhq/hooks/init.sh
fi

# On SIGTERM: backup state to Supabase Storage, then forward signal to children.
_shutdown() {
  log "SIGTERM received — backing up gateway state before exit ..."
  BACKUP_SCRIPT="${DAEMON_DIR:-/opt/yourhq/daemons}/gateway_backup.py"
  [ -f "$BACKUP_SCRIPT" ] || BACKUP_SCRIPT="$(dirname "$(readlink -f "$0")")/daemons/gateway_backup.py"
  if [ -f "$BACKUP_SCRIPT" ] && [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    timeout 60 python3 "$BACKUP_SCRIPT" backup 2>&1 | while read -r line; do log "$line"; done || true
  fi
  # shellcheck disable=SC2046
  kill -TERM $(jobs -p) 2>/dev/null || true
  exit 0
}
trap '_shutdown' TERM INT

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
CONFIG="$OPENCLAW_HOME/openclaw.json"
REPO_DIR="$OPENCLAW_HOME/repo.git"
PLUGIN_SRC="/opt/openclaw-plugins/hq-bootstrap"
PLUGIN_DIR="$OPENCLAW_HOME/plugins/hq-bootstrap"
SHARED_AUTH="$OPENCLAW_HOME/shared-auth"
TEMPLATES_BUNDLED="/opt/templates"

NOVNC_BIND="${NOVNC_BIND:-auto}"
# Export so the in-process daemons (command_runner, secrets_sync, ...) started
# later in hosted mode inherit them. Without the export, a daemon can boot with
# an empty/default GATEWAY_ID and fail to resolve its gateway row (which breaks
# the secrets→auth-profiles bridge, so agents can't authenticate).
GATEWAY_ID="${GATEWAY_ID:-default}"
GATEWAY_LABEL="${GATEWAY_LABEL:-$GATEWAY_ID}"
export GATEWAY_ID GATEWAY_LABEL

log() { echo "[entrypoint] $*"; }

mkdir -p "$OPENCLAW_HOME" "$HOME/.ssh"

# ─────────────────────────────────────────────────────────────
# 0. Resolve Supabase credentials.
#
# Three paths land here:
#
#   A) Co-located UI + gateway (the default install). The UI writes
#      /config/workspaces.json and /config/secrets.json after onboarding;
#      registry_config.py reads them and exports SUPABASE_URL +
#      SUPABASE_SERVICE_ROLE_KEY. We poll with a long timeout so users
#      running `docker compose up -d` before onboarding don't crash-loop.
#
#   B) Remote gateway provisioned via install-gateway.sh. The .env on
#      the remote host carries SUPABASE_URL + SUPABASE_ANON_KEY +
#      GATEWAY_TOKEN. We exchange the token via consume_gateway_token()
#      to claim a gateway_id + slug, then we still need the service role
#      key for everything below — the install-gateway.sh writes it into
#      .env from the UI-side mint flow before this script runs (the
#      one-liner embeds it).
#
#   C) Service role key already in env (manual install / dev). Skip both.
# ─────────────────────────────────────────────────────────────

# Path B: token exchange. Runs before registry fallback so that a remote
# gateway with no /config volume can still bootstrap itself.
if [ -n "${GATEWAY_TOKEN:-}" ] && [ ! -f "$OPENCLAW_HOME/.token-consumed" ]; then
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
    log "GATEWAY_TOKEN set but SUPABASE_URL / SUPABASE_ANON_KEY missing — cannot exchange token."
    log "  install-gateway.sh should have written all three to .env. Aborting."
    exit 1
  fi

  log "Exchanging GATEWAY_TOKEN for a gateway_id ..."
  TOKEN_RESPONSE=$(curl -fsS -X POST \
    "$SUPABASE_URL/rest/v1/rpc/consume_gateway_token" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "import json,os; print(json.dumps({'p_token': os.environ['GATEWAY_TOKEN'], 'p_label': os.environ.get('GATEWAY_LABEL') or None, 'p_slug_hint': os.environ.get('GATEWAY_ID') or None}))")" \
    2>/dev/null) || {
      log "  token exchange failed (network or invalid token). Will not retry — restart with a fresh token."
      exit 1
    }

  # PostgREST returns the SETOF as a JSON array of one row.
  CONSUMED_ID=$(echo "$TOKEN_RESPONSE" | python3 -c "import json,sys; r=json.loads(sys.stdin.read()); print((r[0] if isinstance(r,list) and r else r).get('gateway_id',''))")
  CONSUMED_SLUG=$(echo "$TOKEN_RESPONSE" | python3 -c "import json,sys; r=json.loads(sys.stdin.read()); print((r[0] if isinstance(r,list) and r else r).get('gateway_slug',''))")

  if [ -z "$CONSUMED_ID" ] || [ -z "$CONSUMED_SLUG" ]; then
    log "  token exchange returned no gateway_id (response: $TOKEN_RESPONSE). Aborting."
    exit 1
  fi

  log "  consumed: gateway_id=$CONSUMED_ID slug=$CONSUMED_SLUG"

  # Pin the assigned slug for subsequent boots so we keep registering as
  # the same gateway row even if the user changes GATEWAY_LABEL.
  GATEWAY_ID="$CONSUMED_SLUG"
  export GATEWAY_ID

  # Mark consumed so we don't re-exchange on reboot (the RPC is idempotent
  # for replays from the same gateway, but no need to call it again).
  echo "$CONSUMED_ID" > "$OPENCLAW_HOME/.token-consumed"
  echo "$CONSUMED_SLUG" > "$OPENCLAW_HOME/.gateway-slug"
fi

# Restore pinned slug from a prior boot if it's there.
if [ -f "$OPENCLAW_HOME/.gateway-slug" ]; then
  GATEWAY_ID="$(cat "$OPENCLAW_HOME/.gateway-slug")"
  export GATEWAY_ID
fi

REGISTRY_HELPER="/opt/yourhq/registry_config.py"
[ -f "$REGISTRY_HELPER" ] || REGISTRY_HELPER="/app/registry_config.py"

if [ "$RUNTIME_MODE" = "hosted" ]; then
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
    # E2B template builds run the start command without env vars to snapshot.
    # Sleep briefly so the build sees a healthy start, then exit cleanly.
    log "RUNTIME_MODE=hosted but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set."
    log "Assuming E2B template build — sleeping for snapshot, then exiting."
    sleep 30
    exit 0
  fi
elif [ ! -f "$REGISTRY_HELPER" ]; then
  log "WARNING: registry_config.py not found — registry fallback disabled."
elif [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  log "Supabase env not set; waiting for project registry at /config ..."
  wait_start=$(date +%s)
  REGISTRY_TIMEOUT=${REGISTRY_TIMEOUT:-600}
  while true; do
    # shellcheck disable=SC1090
    eval "$(python3 "$REGISTRY_HELPER" export 2>/dev/null || true)"
    if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
      log "  resolved from ${HQ_CONFIG_SOURCE:-registry}"
      break
    fi
    elapsed=$(($(date +%s) - wait_start))
    if [ "$elapsed" -ge "$REGISTRY_TIMEOUT" ]; then
      log "ERROR: timed out after ${REGISTRY_TIMEOUT}s waiting for onboarding."
      log "       Complete setup in the UI, then restart this container."
      exit 1
    fi
    if [ $((elapsed % 30)) -eq 0 ]; then
      log "  still waiting for onboarding (${elapsed}s) — complete it in the UI"
    fi
    sleep 5
  done
fi

# Ensure resolved creds are exported (registry fallback sets shell vars
# but docker-compose may have injected empty env vars that shadow them).
if [ -n "${SUPABASE_URL:-}" ]; then
  export SUPABASE_URL
  export SUPABASE_SERVICE_ROLE_KEY
  export SUPABASE_ANON_KEY
fi

# Write base Supabase creds to gateway.env so agent scripts (hq_base.py)
# can read them.  secrets_sync will merge user-created secrets on top later.
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  _secrets_dir="$OPENCLAW_HOME/secrets"
  mkdir -p "$_secrets_dir"
  chmod 700 "$_secrets_dir"
  cat > "$_secrets_dir/gateway.env" <<GWEOF
GATEWAY_ID=${GATEWAY_ID}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
EMBEDDER_URL=${EMBEDDER_URL:-http://embedder:18801}
EMBEDDER_MODEL=${EMBEDDER_MODEL:-BAAI/bge-small-en-v1.5}
GWEOF
  chmod 600 "$_secrets_dir/gateway.env"
fi

# ─────────────────────────────────────────────────────────────
# 0b. Restore from backup (if no local agent state exists).
#     If the gateway is starting fresh (no agents dir = first boot
#     or recreated sandbox), check Supabase Storage for a previous
#     backup and extract it. This restores auth tokens, configs,
#     and secrets so the gateway comes back online without reauth.
# ─────────────────────────────────────────────────────────────

if [ ! -d "$OPENCLAW_HOME/agents" ] && [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  BACKUP_SCRIPT="${DAEMON_DIR:-/opt/yourhq/daemons}/gateway_backup.py"
  [ -f "$BACKUP_SCRIPT" ] || BACKUP_SCRIPT="$(dirname "$(readlink -f "$0")")/daemons/gateway_backup.py"
  if [ -f "$BACKUP_SCRIPT" ]; then
    log "No local agent state — checking for backup to restore ..."
    if python3 "$BACKUP_SCRIPT" restore 2>&1 | while read -r line; do log "$line"; done; then
      log "Backup restore complete."
    else
      log "No backup found or restore failed — continuing with fresh setup."
    fi
  fi
elif [ -d "$OPENCLAW_HOME/agents" ]; then
  log "Local agent state exists — skipping restore."
fi

# ─────────────────────────────────────────────────────────────
# 1 & 2. Git repo + templates + optional remote
# ─────────────────────────────────────────────────────────────

seed_templates_from_dir() {
  local src="$1"
  log "Seeding templates from $src ..."
  local shared_dir="$src/_shared"
  local work
  work="$(mktemp -d)"
  cd "$work"
  git init -q
  git config user.email "gateway@yourhq.local"
  git config user.name "HQ Gateway"
  for tpl_path in "$src"/*; do
    [ -d "$tpl_path" ] || continue
    local tpl_name
    tpl_name="$(basename "$tpl_path")"
    [ "$tpl_name" = "README.md" ] && continue
    [ "$tpl_name" = "_shared" ] && continue
    local branch
    if [ "$tpl_name" = "default" ]; then
      branch="default"
    else
      branch="template/$tpl_name"
    fi
    git checkout --orphan "$branch" -q
    git rm -rf --cached . >/dev/null 2>&1 || true
    rm -rf -- *
    # Layer shared files first, then template-specific files on top (overrides win)
    [ -d "$shared_dir" ] && cp -a "$shared_dir"/. .
    cp -a "$tpl_path"/. .
    git add -A
    git commit -q -m "Seed $branch from bundled templates" || true
    # Push into the bare repo as a branch
    git push -q "$REPO_DIR" "$branch:$branch" --force 2>/dev/null || true
    log "  seeded branch $branch"
  done
  cd /
  rm -rf "$work"
}

if [ ! -d "$REPO_DIR" ]; then
  log "First boot — initializing bare repo at $REPO_DIR"
  git init --bare "$REPO_DIR" -q
  git -C "$REPO_DIR" symbolic-ref HEAD refs/heads/default

  # Resolve template source
  if [ -n "${TEMPLATES_SOURCE:-}" ]; then
    case "$TEMPLATES_SOURCE" in
      git+*)
        TS_URL="${TEMPLATES_SOURCE#git+}"
        log "Cloning TEMPLATES_SOURCE $TS_URL ..."
        rm -rf /tmp/templates-src
        git clone --depth 1 "$TS_URL" /tmp/templates-src
        if [ -d /tmp/templates-src/templates ]; then
          seed_templates_from_dir /tmp/templates-src/templates
        else
          seed_templates_from_dir /tmp/templates-src
        fi
        rm -rf /tmp/templates-src
        ;;
      *)
        log "Unrecognized TEMPLATES_SOURCE format (expected git+<url>); falling back to bundled."
        seed_templates_from_dir "$TEMPLATES_BUNDLED"
        ;;
    esac
  else
    seed_templates_from_dir "$TEMPLATES_BUNDLED"
  fi
fi

# Optional: attach a user-supplied git remote for backup/sync.
#
# Two ways to configure:
#   1. GIT_REMOTE_URL (+ optional GIT_DEPLOY_KEY for SSH) — works for any host.
#   2. GITHUB_TOKEN + GITHUB_REPO_OWNER + GITHUB_REPO_NAME — GitHub shorthand.
#      We synthesize an HTTPS URL with a token-embedded user. No deploy key
#      needed for this path (the PAT is the credential).
if [ -z "${GIT_REMOTE_URL:-}" ] \
    && [ -n "${GITHUB_TOKEN:-}" ] \
    && [ -n "${GITHUB_REPO_OWNER:-}" ] \
    && [ -n "${GITHUB_REPO_NAME:-}" ]; then
  GIT_REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}.git"
  log "Synthesized GIT_REMOTE_URL from GITHUB_* env vars"
fi

if [ -n "${GIT_REMOTE_URL:-}" ]; then
  # Write deploy key if provided (SSH remotes).
  if [ -n "${GIT_DEPLOY_KEY:-}" ] && [ ! -f "$HOME/.ssh/openclaw_deploy_key" ]; then
    printf '%s\n' "$GIT_DEPLOY_KEY" > "$HOME/.ssh/openclaw_deploy_key"
    chmod 600 "$HOME/.ssh/openclaw_deploy_key"
    if ! grep -q openclaw_deploy_key "$HOME/.ssh/config" 2>/dev/null; then
      cat >> "$HOME/.ssh/config" << 'SSHCFG'
Host *
  IdentityFile ~/.ssh/openclaw_deploy_key
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
SSHCFG
      chmod 600 "$HOME/.ssh/config"
    fi
  fi

  if ! git -C "$REPO_DIR" remote | grep -q '^origin$'; then
    git -C "$REPO_DIR" remote add origin "$GIT_REMOTE_URL"
    git -C "$REPO_DIR" config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
    log "Added git remote origin"
  else
    # Remote already exists from a prior boot; update URL in case the token rotated.
    git -C "$REPO_DIR" remote set-url origin "$GIT_REMOTE_URL"
  fi

  # Install a post-commit hook that async-pushes every commit to origin.
  # Runs in the background; failures don't block the commit. If the network
  # is down or credentials are wrong, the commit still lands locally.
  mkdir -p "$REPO_DIR/hooks"
  cat > "$REPO_DIR/hooks/post-commit" << 'HOOK_EOF'
#!/bin/sh
branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
[ -n "$branch" ] || exit 0
(git push origin "$branch" > /dev/null 2>&1 &) || true
HOOK_EOF
  chmod +x "$REPO_DIR/hooks/post-commit"
  log "Installed post-commit auto-push hook"

  git -C "$REPO_DIR" fetch origin --prune 2>/dev/null \
    && log "Fetched from origin" \
    || log "  (remote fetch failed — proceeding with local branches)"
fi

# ─────────────────────────────────────────────────────────────
# 3. Networking — Tailscale lives on the HOST, not in this container.
# The host's NETWORKING_MODE determines which ports publish to 0.0.0.0
# vs 127.0.0.1; that's configured in docker-compose.yml + .env, not here.
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# 4. Onboard (first boot)
# ─────────────────────────────────────────────────────────────

if [ ! -f "$CONFIG" ]; then
  log "Running openclaw onboard (non-interactive) ..."
  # --skip-health: we don't have a gateway running yet; the health probe
  # is meaningless on first boot in a container. We launch the gateway
  # ourselves at the end of this script.
  openclaw onboard \
    --non-interactive --flow quickstart \
    --auth-choice skip --accept-risk --skip-health \
    --gateway-port 18789 --gateway-bind lan \
    || log "  onboard exited non-zero — will retry next start"
fi

# ─────────────────────────────────────────────────────────────
# 5 & 6. Patch openclaw.json + install bootstrap plugin (idempotent)
# ─────────────────────────────────────────────────────────────

if [ -f "$CONFIG" ]; then
  log "Patching openclaw.json ..."
  TMP=$(mktemp)
  jq --arg plugin_path "$PLUGIN_DIR" '
    (if .agents.defaults.tools then del(.agents.defaults.tools) else . end) |
    .tools.profile = "full" |
    # openclaw >=6.x runs tool execution through the Codex sandbox runtime,
    # gated by tools.codeMode. Without it agents come up in pure chat mode
    # with zero tools (no exec, no browser, no web_search).
    .tools.codeMode = true |
    .gateway.bind = "lan" |
    .browser.executablePath //= "/usr/bin/google-chrome-stable" |
    .browser.defaultProfile //= "openclaw" |
    .browser.noSandbox = true |
    .browser.extraArgs = ((.browser.extraArgs // []) + ["--remote-allow-origins=*"] | unique) |
    .channels.telegram.enabled //= true |
    .channels.telegram.dmPolicy //= "pairing" |
    .channels.telegram.groupPolicy //= "open" |
    # openclaw >=5.x requires channels.telegram.streaming to be an OBJECT
    # (mode: ...). The legacy string form fails config validation and blocks
    # gateway startup. Normalize to the object form unless already an object.
    .channels.telegram.streaming = (
      if (.channels.telegram.streaming | type) == "object"
      then .channels.telegram.streaming
      else { mode: "partial" }
      end
    ) |
    .plugins.entries.telegram.enabled //= true |
    .plugins.entries["hq-bootstrap"].enabled = true |
    # openclaw >=5.x gates raw conversation hooks (llm_output for usage,
    # before_agent_reply for budget enforcement, etc.) behind an explicit
    # grant for non-bundled plugins. Without it the hooks silently never fire.
    .plugins.entries["hq-bootstrap"].hooks.allowConversationAccess = true |
    .plugins.load.paths = ((.plugins.load.paths // []) + [$plugin_path] | unique)
  ' "$CONFIG" > "$TMP" && mv "$TMP" "$CONFIG"
fi

# openclaw >=6.x ships provider integrations as installable plugins instead
# of bundling them. Without the provider plugin, `openclaw models auth`
# fails and agents can't resolve their model. Install into ~/.openclaw
# (a volume, so this must happen at boot, not image build). Idempotent —
# skip anything already installed. Extend via OPENCLAW_PROVIDER_PLUGINS.
PROVIDER_PLUGINS="${OPENCLAW_PROVIDER_PLUGINS:-openai}"
INSTALLED_PLUGINS=$(openclaw plugins list 2>/dev/null || true)
for p in $PROVIDER_PLUGINS; do
  if ! printf '%s' "$INSTALLED_PLUGINS" | grep -q "$p"; then
    log "Installing provider plugin: $p ..."
    openclaw plugins install "$p" \
      || log "  ⚠ failed to install provider plugin $p — model auth for it will not work"
  fi
done

if [ -d "$PLUGIN_SRC" ]; then
  mkdir -p "$PLUGIN_DIR"
  cp -f "$PLUGIN_SRC"/*.json "$PLUGIN_DIR/" 2>/dev/null || true
  cp -f "$PLUGIN_SRC"/*.ts "$PLUGIN_DIR/" 2>/dev/null || true
  # OpenClaw >=5.x refuses to load plugins from world-writable directories
  # (security guard against tampering). The volume/copy can leave 0777, so
  # tighten to 0755 or the plugin is silently blocked at load.
  chmod -R go-w "$PLUGIN_DIR"
fi

mkdir -p "$SHARED_AUTH"

# Suppress Chrome first-run dialog and default-browser prompt.
CHROME_PROFILE_DIR="${HOME}/.config/google-chrome/openclaw"
mkdir -p "$CHROME_PROFILE_DIR"
touch "$CHROME_PROFILE_DIR/First Run"

# ─────────────────────────────────────────────────────────────
# 7. Xtigervnc + XFCE desktop on :1
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# 7. Xtigervnc (combined X server + VNC server) on :1
# Replaces the prior Xvfb + x0vncserver two-process setup.
# Xtigervnc handles both the X display and the VNC protocol in one
# process, avoiding the perl-wrapper/defunct-child issues we hit
# with tigervnc-scraping-server on Ubuntu 24.04.
# ─────────────────────────────────────────────────────────────

mkdir -p "$HOME/.vnc"
log "Preparing VNC password ..."
if [ ! -f "$HOME/.vnc/passwd" ]; then
  VNC_PW="${VNC_PASSWORD:-$(head -c 12 /dev/urandom | base64 | tr -d '=+/' | head -c 12)}"
  printf '%s\n%s\n' "$VNC_PW" "$VNC_PW" | vncpasswd -f > "$HOME/.vnc/passwd" 2>/dev/null \
    || echo "$VNC_PW" | vncpasswd -f > "$HOME/.vnc/passwd"
  chmod 600 "$HOME/.vnc/passwd"
  echo "$VNC_PW" > "$OPENCLAW_HOME/.vnc-password"
  log "  VNC password written"
fi

# Clear stale X locks from a crashed previous run.
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true

log "Starting Xtigervnc :1 (integrated X + VNC) ..."
# -rfbport 5901        RFB/VNC port websockify connects to
# -rfbauth <file>      password file (same format as vncpasswd produces)
# -localhost=1         only accept RFB from 127.0.0.1 (websockify in-container)
# -SecurityTypes VncAuth  accept the password auth scheme we set up
# -geometry / -depth   screen dimensions; 1920x1080 matches prior setup
# -AlwaysShared=1      allow multiple viewers to connect concurrently
Xtigervnc :1 \
  -geometry 1920x1080 -depth 24 \
  -rfbport 5901 -rfbauth "$HOME/.vnc/passwd" \
  -SecurityTypes VncAuth \
  -localhost=1 -AlwaysShared=1 \
  > "$HOME/.vnc/Xtigervnc.log" 2>&1 &
XVNC_PID=$!

# Wait for the display socket to exist before starting WM.
for _ in $(seq 1 20); do
  [ -e /tmp/.X11-unix/X1 ] && break
  sleep 0.25
done

sleep 1
if ! kill -0 "$XVNC_PID" 2>/dev/null; then
  log "⚠ Xtigervnc exited immediately — tail log:"
  tail -20 "$HOME/.vnc/Xtigervnc.log" 2>&1 | sed 's/^/    /'
fi

# Clipboard bridging. autocutsel copies text between X selections so
# noVNC's clipboard panel ↔ the Linux desktop's primary + clipboard
# selections stay in sync. Without this, text you paste into the
# noVNC panel never lands in Chrome/terminal/etc.
#   -s PRIMARY    mirrors CLIPBOARD → PRIMARY (so middle-click pastes it)
#   -fork         detach, don't block the shell
log "Starting autocutsel (clipboard sync) ..."
DISPLAY=:1 autocutsel -fork > "$HOME/.vnc/autocutsel.log" 2>&1 || true
DISPLAY=:1 autocutsel -fork -selection PRIMARY > "$HOME/.vnc/autocutsel-primary.log" 2>&1 || true

log "Starting XFCE session on :1 ..."
# XFCE's components talk over a session D-Bus. In a container we have
# to start that bus ourselves: `dbus-launch --exit-with-session` has
# been unreliable (xfce4-session ends up with no bus address, every
# g_dbus_proxy_call_sync fails, and the panel/wm/settings never spawn).
# Instead: start dbus-daemon explicitly, capture its address, export
# it so all XFCE children inherit it.

xdg-user-dirs-update 2>/dev/null || true

# ~/Desktop is a per-container ephemeral dir, but agent shortcuts are
# written by add-agent.sh in the runner container. Point ~/Desktop at
# the shared .openclaw/Desktop/ so xfdesktop sees shortcuts created by
# any container that writes to the gateway-state volume.
mkdir -p "$HOME/.openclaw/Desktop"
if [ ! -L "$HOME/Desktop" ]; then
  # Could be: missing, a real empty dir, or a real dir with content.
  # Only touch the first two — never blow away user content.
  if [ ! -e "$HOME/Desktop" ]; then
    ln -s "$HOME/.openclaw/Desktop" "$HOME/Desktop"
  elif [ -d "$HOME/Desktop" ] && [ -z "$(ls -A "$HOME/Desktop" 2>/dev/null)" ]; then
    rm -rf "$HOME/Desktop"
    ln -s "$HOME/.openclaw/Desktop" "$HOME/Desktop"
  fi
fi


XDG_RUNTIME_DIR="/tmp/runtime-$(id -u)"
export XDG_RUNTIME_DIR
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

# XDG base dirs. Without these, xfconfd refuses to start ("Unable to
# create configuration directory (null)") because some glib/xfconf
# builds don't apply the $HOME/.config fallback automatically.
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

export DISPLAY=:1
export XDG_SESSION_TYPE=x11
export XDG_CONFIG_DIRS="/etc/xdg"
export XDG_DATA_DIRS="/usr/local/share:/usr/share"

# Start session D-Bus with a deterministic socket path so we don't
# have to parse `dbus-daemon --print-address` (which in some Docker
# setups double-forks in a way that leaves its reported address
# pointing at a socket the parent can't see).
DBUS_SOCK="$XDG_RUNTIME_DIR/bus"
rm -f "$DBUS_SOCK"
dbus-daemon --session --nofork \
  --address="unix:path=$DBUS_SOCK" \
  > "$HOME/dbus.log" 2>&1 &
DBUS_PID=$!
# Wait for the socket to appear (usually <200ms).
for _ in $(seq 1 40); do
  [ -S "$DBUS_SOCK" ] && break
  sleep 0.1
done
if [ -S "$DBUS_SOCK" ]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$DBUS_SOCK"
  log "  session D-Bus ready at $DBUS_SESSION_BUS_ADDRESS (pid $DBUS_PID)"
else
  log "⚠ session D-Bus socket never appeared at $DBUS_SOCK — XFCE will be broken."
  tail -20 "$HOME/dbus.log" 2>&1 | sed 's/^/    /'
fi

startxfce4 > "$HOME/xfce.log" 2>&1 &
XFCE_PID=$!
sleep 3
if ! kill -0 "$XFCE_PID" 2>/dev/null; then
  log "⚠ XFCE session exited immediately — tail log:"
  tail -30 "$HOME/xfce.log" 2>&1 | sed 's/^/    /'
fi

# Force desktop-icons style=2 at xfconf level. Run in background with a
# hard timeout — xfconfd may not be up yet, and xfdesktop --reload can
# hang when invoked before xfdesktop itself is running. We don't block
# the main startup on any of this; it's cosmetic.
(
  for _ in $(seq 1 40); do
    xfconf-query -c xfce4-desktop -l >/dev/null 2>&1 && break
    sleep 0.25
  done
  xfconf-query -c xfce4-desktop -p /desktop-icons/style -s 2 --create -t int \
    2>/dev/null || true
  # Only try to reload if an xfdesktop process is already running; with
  # no daemon present, `xfdesktop --reload` can block waiting for one.
  if pgrep -x xfdesktop >/dev/null 2>&1; then
    timeout 3 xfdesktop --reload 2>/dev/null || true
  fi
) > "$HOME/xfconf-boot.log" 2>&1 &

# ─────────────────────────────────────────────────────────────
# 8. websockify (noVNC) + optional Caddy
# ─────────────────────────────────────────────────────────────

# Inside the container, websockify always listens on 0.0.0.0. The HOST's
# port mapping in docker-compose.yml decides whether 6901 is reachable
# only on 127.0.0.1 (local mode) or on 0.0.0.0 including the host's
# tailnet/public interface (tailscale/public mode). See NOVNC_HOST_PORT.
NOVNC_LISTEN_ADDR=""
case "$NOVNC_BIND" in
  off) NOVNC_LISTEN_ADDR="" ;;
  *)   NOVNC_LISTEN_ADDR="0.0.0.0:6901" ;;
esac

if [ -n "$NOVNC_LISTEN_ADDR" ]; then
  log "Starting websockify on $NOVNC_LISTEN_ADDR -> localhost:5901 ..."
  websockify --web=/usr/share/novnc "$NOVNC_LISTEN_ADDR" localhost:5901 \
    > "$HOME/.vnc/websockify.log" 2>&1 &
fi

# ─────────────────────────────────────────────────────────────
# 9. Register this gateway in Supabase
# ─────────────────────────────────────────────────────────────

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  log "Registering gateway $GATEWAY_ID in Supabase ..."
  # HOST_REACHABLE_URL is set by the installer based on NETWORKING_MODE:
  #   local     -> http://localhost
  #   tailscale -> http://<host-tailscale-ip>
  #   public    -> https://<user-domain>
  # The gateway/UI use this to build files-API and noVNC URLs.
  # Read VNC password so we can include it in the registration metadata.
  VNC_PW_FILE="$OPENCLAW_HOME/.vnc-password"
  export REG_VNC_PW=""
  if [ -f "$VNC_PW_FILE" ]; then
    REG_VNC_PW="$(cat "$VNC_PW_FILE")"
    export REG_VNC_PW
  fi

  # Source platform-specific URL resolution hook if present.
  # The hook sets REACHABLE_BASE, REACHABLE_FILES_API, REACHABLE_NOVNC.
  if [ -f /opt/yourhq/hooks/resolve-urls.sh ]; then
    source /opt/yourhq/hooks/resolve-urls.sh
  fi

  # In hosted mode, if the hook didn't resolve URLs, retry up to 30s.
  if [ "${RUNTIME_MODE:-}" = "hosted" ] && [ -z "${REACHABLE_BASE:-}" ]; then
    log "  hosted mode but REACHABLE_BASE not set — waiting for URL resolution..."
    for _retry in $(seq 1 30); do
      sleep 1
      [ -f /opt/yourhq/hooks/resolve-urls.sh ] && source /opt/yourhq/hooks/resolve-urls.sh
      [ -n "${REACHABLE_BASE:-}" ] && break
    done
    if [ -n "${REACHABLE_BASE:-}" ]; then
      log "  resolved REACHABLE_BASE=$REACHABLE_BASE"
    else
      log "  WARNING: REACHABLE_BASE still not set after 30s"
    fi
  fi

  REACHABLE_JSON=$(python3 - <<'PYEOF'
import json, os
reachable_base = os.environ.get("REACHABLE_BASE", "").strip()
if reachable_base:
    meta_urls = {
        "base": reachable_base,
        "files_api": os.environ.get("REACHABLE_FILES_API", ""),
        "novnc": os.environ.get("REACHABLE_NOVNC", ""),
    }
    networking_mode = "hosted"
else:
    base = os.environ.get("HOST_REACHABLE_URL", "http://localhost").rstrip("/")
    files_port = os.environ.get("FILES_API_PORT", "18790")
    meta_urls = {
        "base": base,
        "files_api": f"{base}:{files_port}",
        "novnc": f"{base}:6901/vnc.html?autoconnect=1&resize=remote",
    }
    networking_mode = os.environ.get("NETWORKING_MODE", "local")
vnc_pw = os.environ.get("REG_VNC_PW", "")
meta = {
    "reachable_urls": meta_urls,
    "networking_mode": networking_mode,
    "version": os.environ.get("OPENCLAW_VERSION", ""),
}
if vnc_pw:
    meta["vnc_password"] = vnc_pw
gw_auth = os.environ.get("GATEWAY_AUTH_TOKEN", "").strip()
if gw_auth:
    meta["files_api_token"] = gw_auth
print(json.dumps(meta))
PYEOF
  )
  # Upsert by slug; create if missing.
  curl -fsS -X POST \
    "$SUPABASE_URL/rest/v1/gateways?on_conflict=tenant_id,slug" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    -d "$(python3 -c "import json,os,sys; print(json.dumps({'slug': os.environ['GATEWAY_ID'], 'label': os.environ['GATEWAY_LABEL'], 'status': 'ready', 'last_seen_at': __import__('datetime').datetime.utcnow().isoformat()+'Z', 'tenant_id': os.environ.get('TENANT_ID', '00000000-0000-0000-0000-000000000000'), 'meta': json.loads(sys.stdin.read())}))" <<< "$REACHABLE_JSON")" \
    > /dev/null \
    && log "  registered (reachable at $(echo "$REACHABLE_JSON" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['reachable_urls']['base'])"))" \
    || log "  registration failed (Supabase unreachable or gateways table missing — will retry from daemon)"

  # Resolve the gateway's UUID so the plugin can tag agent_usage rows.
  GATEWAY_DB_ID=$(curl -fsS \
    "$SUPABASE_URL/rest/v1/gateways?slug=eq.$GATEWAY_ID&select=id&limit=1" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | python3 -c "import json,sys; rows=json.load(sys.stdin); print(rows[0]['id'] if rows else '')" 2>/dev/null \
    || true)
  if [ -n "$GATEWAY_DB_ID" ]; then
    export GATEWAY_DB_ID
    log "  resolved GATEWAY_DB_ID=$GATEWAY_DB_ID"
  fi
else
  log "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; skipping gateway registration."
fi

# ─────────────────────────────────────────────────────────────
# 10. Start files-API.
#     The files-API serves the agent worktrees to the HQ UI over
#     the Docker internal network (or Tailscale, if enabled).
#
#     Auth: shared bearer token. Resolution order:
#       1. GATEWAY_AUTH_TOKEN env (legacy .env-based installs)
#       2. /config/gateway-auth-token (file written by the UI on
#          first boot — the default for browser-onboarding installs)
#     If neither is present we skip — the UI will create the file
#     the first time someone opens an agent's Files tab, after which
#     the next gateway restart picks it up.
# ─────────────────────────────────────────────────────────────

if [ -z "${GATEWAY_AUTH_TOKEN:-}" ] && [ -r "/config/gateway-auth-token" ]; then
  GATEWAY_AUTH_TOKEN="$(cat /config/gateway-auth-token | tr -d '[:space:]')"
  export GATEWAY_AUTH_TOKEN
  log "  resolved GATEWAY_AUTH_TOKEN from /config/gateway-auth-token"
fi

if [ -n "${GATEWAY_AUTH_TOKEN:-}" ] && [ "${FILES_API_BIND:-docker}" != "off" ]; then
  log "Starting files-API (bind=${FILES_API_BIND:-docker}) ..."
  FILES_API_BIND="${FILES_API_BIND:-docker}" \
  FILES_API_PORT="${FILES_API_PORT:-18790}" \
  GATEWAY_AUTH_TOKEN="$GATEWAY_AUTH_TOKEN" \
  python3 /usr/local/bin/files_api.py > "$HOME/files-api.log" 2>&1 &
else
  log "files-API disabled (no token at /config/gateway-auth-token or in env, or FILES_API_BIND=off)."
fi

# ─────────────────────────────────────────────────────────────
# 11. Clear stale Chrome profile locks
# ─────────────────────────────────────────────────────────────
# If the gateway crashed mid-browser-session (or the container got killed),
# each agent's Chrome user-data-dir will have Singleton* symlinks pointing
# at the dead process's hostname-PID. A fresh Chrome sees the lock, aborts
# the launch, and openclaw reports "CDP websocket not reachable". Sweep
# them all at boot so the first launch of the new gateway is clean.
log "Clearing stale Chrome Singleton* locks in all agent profiles ..."
find "$HOME/.openclaw/browser" -maxdepth 3 -name "Singleton*" -delete 2>/dev/null || true

# OpenClaw >=6.6 blocks plugins whose path is world-writable (mode & 002).
# E2B sandboxes create npm project dirs with 777 perms, which triggers this
# check for the codex plugin. Tighten all dirs/files under the npm tree.
if [ -d "$HOME/.openclaw/npm" ]; then
  find "$HOME/.openclaw/npm" -type d -perm /o+w -exec chmod 755 {} + 2>/dev/null || true
  find "$HOME/.openclaw/npm" -type f -perm /o+w -exec chmod 644 {} + 2>/dev/null || true
  find "$HOME/.openclaw/npm" -path "*/bin/*" -type f -exec chmod 755 {} + 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────
# 12. In hosted mode, start daemons in-process.
#     In docker mode they run as separate containers (dispatcher,
#     runner in docker-compose.yml). In hosted mode there's one
#     process tree — everything runs here.
# ─────────────────────────────────────────────────────────────

if [ "$RUNTIME_MODE" = "hosted" ]; then
  DAEMON_DIR="/opt/yourhq/daemons"
  [ -d "$DAEMON_DIR" ] || DAEMON_DIR="$(dirname "$(readlink -f "$0")")/daemons"

  # Kill stale daemons left over from a previous crashed run. In hosted mode
  # there is no container boundary — orphaned processes survive gateway crashes
  # and pile up on each restart.
  log "Killing stale daemons from previous run (if any) ..."
  for _daemon in embedder.py inbox_dispatcher.py command_runner.py file_processor.py source_sync.py plugin_runner.py; do
    pkill -f "python3.*${_daemon}" 2>/dev/null || true
  done
  sleep 1

  if [ -f "$DAEMON_DIR/embedder.py" ] && [ -z "${EMBEDDER_URL:-}" ]; then
    # Use port 9100 in hosted mode — 18801 is the first CDP port allocated
    # by add-agent.sh and would collide with the first agent's Chrome.
    export EMBEDDER_PORT="${EMBEDDER_PORT:-9100}"
    export EMBEDDER_URL="http://localhost:${EMBEDDER_PORT}"
  fi

  if [ -f "$DAEMON_DIR/embedder.py" ]; then
    log "Starting embedder (in-process, hosted mode) ..."
    EMBEDDER_CACHE_DIR="${EMBEDDER_CACHE_DIR:-/opt/yourhq/models}" \
    python3 "$DAEMON_DIR/embedder.py" > "$HOME/embedder.log" 2>&1 &
  fi

  if [ -f "$DAEMON_DIR/inbox_dispatcher.py" ]; then
    log "Starting inbox_dispatcher (in-process, hosted mode) ..."
    python3 "$DAEMON_DIR/inbox_dispatcher.py" > "$HOME/inbox-dispatcher.log" 2>&1 &
  fi

  if [ -f "$DAEMON_DIR/command_runner.py" ]; then
    log "Starting command_runner (in-process, hosted mode) ..."
    python3 "$DAEMON_DIR/command_runner.py" > "$HOME/command-runner.log" 2>&1 &
  fi

  if [ -f "$DAEMON_DIR/file_processor.py" ]; then
    log "Starting file_processor (in-process, hosted mode) ..."
    python3 "$DAEMON_DIR/file_processor.py" > "$HOME/file-processor.log" 2>&1 &
  fi

  if [ -f "$DAEMON_DIR/source_sync.py" ]; then
    log "Starting source_sync (in-process, hosted mode) ..."
    python3 "$DAEMON_DIR/source_sync.py" > "$HOME/source-sync.log" 2>&1 &
  fi
fi

# ─────────────────────────────────────────────────────────────
# 13. Launch OpenClaw gateway as PID 1 (well, exec'd under tini)
# ─────────────────────────────────────────────────────────────

log "Starting openclaw gateway (foreground) ..."
# Export the X11/XDG environment so openclaw's managed browser launcher
# spawns Chrome into our Xtigervnc display.
export DISPLAY=:1
XDG_RUNTIME_DIR="/tmp/runtime-$(id -u)"
export XDG_RUNTIME_DIR
export XDG_SESSION_TYPE=x11
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_CONFIG_DIRS="/etc/xdg"
export XDG_DATA_DIRS="/usr/local/share:/usr/share"
[ -S "$XDG_RUNTIME_DIR/bus" ] && \
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"

SECRETS_ENV="$OPENCLAW_HOME/secrets/gateway.env"
if [ -f "$SECRETS_ENV" ]; then
  set -a
  # shellcheck source=/dev/null
  . "$SECRETS_ENV"
  set +a
fi

exec openclaw gateway run
