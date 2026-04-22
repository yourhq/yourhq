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
#      (local | tailscale | public). Optionally front with Caddy for TLS.
#   9. Upsert this gateway's row in the Supabase `gateways` table so the UI
#      can see it and populate reachable URLs.
#  10. Exec `openclaw gateway run` as the container's main process.
#
# OAuth login is NOT run automatically — the UI triggers it via the command
# queue in Phase 3, or you can run it manually:
#   docker compose exec gateway openclaw models auth login \
#     --provider openai-codex --set-default
# =============================================================================
set -euo pipefail

# Forward SIGTERM from tini to children
trap 'kill -TERM $(jobs -p) 2>/dev/null || true; exit 0' TERM INT

OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
CONFIG="$OPENCLAW_HOME/openclaw.json"
REPO_DIR="$OPENCLAW_HOME/repo.git"
PLUGIN_SRC="/opt/openclaw-plugins/hq-bootstrap"
PLUGIN_DIR="$OPENCLAW_HOME/plugins/hq-bootstrap"
SHARED_AUTH="$OPENCLAW_HOME/shared-auth"
TEMPLATES_BUNDLED="/opt/templates"

NOVNC_BIND="${NOVNC_BIND:-auto}"
GATEWAY_ID="${GATEWAY_ID:-default}"
GATEWAY_LABEL="${GATEWAY_LABEL:-$GATEWAY_ID}"

log() { echo "[entrypoint] $*"; }

mkdir -p "$OPENCLAW_HOME" "$HOME/.ssh"

# ─────────────────────────────────────────────────────────────
# 1 & 2. Git repo + templates + optional remote
# ─────────────────────────────────────────────────────────────

seed_templates_from_dir() {
  local src="$1"
  log "Seeding templates from $src ..."
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
    local branch
    if [ "$tpl_name" = "default" ]; then
      branch="default"
    else
      branch="template/$tpl_name"
    fi
    git checkout --orphan "$branch" -q
    git rm -rf --cached . >/dev/null 2>&1 || true
    rm -rf -- *
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
    log "Added git remote origin -> $GIT_REMOTE_URL"
  fi
  git -C "$REPO_DIR" fetch origin --prune 2>/dev/null \
    && log "Fetched from origin" \
    || log "  (remote fetch failed — proceeding with local branches)"
fi

# ─────────────────────────────────────────────────────────────
# 3. Tailscale
# ─────────────────────────────────────────────────────────────

TAILSCALE_IP=""

if [ -n "${TAILSCALE_AUTH_KEY:-}" ]; then
  if [ ! -e /dev/net/tun ]; then
    log "WARNING: /dev/net/tun missing; Tailscale will fail. Compose must mount it + NET_ADMIN."
  fi

  log "Starting tailscaled ..."
  sudo_maybe() { if command -v sudo >/dev/null; then sudo "$@"; else "$@"; fi; }
  # tailscaled needs root; this entrypoint runs as `openclaw`, so we rely on
  # the image being launched with cap_add: NET_ADMIN and the tailscale paths
  # being writable by our user. We write state under ~/.tailscale instead of
  # /var/lib/tailscale to avoid root requirements.
  mkdir -p "$HOME/.tailscale" "$HOME/.tailscale/run"
  /usr/local/bin/tailscaled \
    --tun=userspace-networking \
    --state="$HOME/.tailscale/tailscaled.state" \
    --socket="$HOME/.tailscale/run/tailscaled.sock" \
    > "$HOME/.tailscale/tailscaled.log" 2>&1 &
  TAILSCALED_PID=$!

  # Wait for the socket
  for _ in $(seq 1 20); do
    [ -S "$HOME/.tailscale/run/tailscaled.sock" ] && break
    sleep 0.5
  done

  TS_SOCK="$HOME/.tailscale/run/tailscaled.sock"
  /usr/local/bin/tailscale --socket="$TS_SOCK" up \
    --authkey="$TAILSCALE_AUTH_KEY" \
    --hostname="yourhq-${GATEWAY_ID}" \
    --accept-routes \
    --reset \
    || log "  tailscale up failed (token may be consumed or invalid)"

  if [ -n "${TAILSCALE_EXIT_NODE:-}" ]; then
    log "Setting Tailscale exit node to $TAILSCALE_EXIT_NODE ..."
    /usr/local/bin/tailscale --socket="$TS_SOCK" set \
      --exit-node="$TAILSCALE_EXIT_NODE" \
      --exit-node-allow-lan-access \
      || log "  exit-node set failed (check that the node is approved)"
  fi

  # Read back the assigned Tailscale IP
  TAILSCALE_IP="$(/usr/local/bin/tailscale --socket="$TS_SOCK" ip -4 2>/dev/null | head -1 || true)"
  [ -n "$TAILSCALE_IP" ] && log "Tailscale IP: $TAILSCALE_IP"

  # Re-export for consume by the openclaw process if needed
  export TAILSCALE_SOCKET="$TS_SOCK"
fi

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
    --gateway-port 18789 --gateway-bind loopback \
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
    .browser.executablePath //= "/usr/bin/google-chrome-stable" |
    .browser.defaultProfile //= "openclaw" |
    .browser.noSandbox = true |
    .channels.telegram.enabled //= true |
    .channels.telegram.dmPolicy //= "pairing" |
    .channels.telegram.groupPolicy //= "open" |
    .channels.telegram.streaming //= "partial" |
    .plugins.entries.telegram.enabled //= true |
    .plugins.entries["hq-bootstrap"].enabled = true |
    .plugins.load.paths = ((.plugins.load.paths // []) + [$plugin_path] | unique)
  ' "$CONFIG" > "$TMP" && mv "$TMP" "$CONFIG"
fi

if [ -d "$PLUGIN_SRC" ]; then
  mkdir -p "$PLUGIN_DIR"
  cp -f "$PLUGIN_SRC"/*.json "$PLUGIN_DIR/" 2>/dev/null || true
  cp -f "$PLUGIN_SRC"/*.ts "$PLUGIN_DIR/" 2>/dev/null || true
fi

mkdir -p "$SHARED_AUTH"

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
  log "  VNC password written to $OPENCLAW_HOME/.vnc-password"
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


export XDG_RUNTIME_DIR="/tmp/runtime-$(id -u)"
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

# Force desktop-icons style=2 at xfconf level. Our XML default is only
# consulted when no user setting exists — xfconfd may stash a stale value
# of 0 from an earlier run. Re-apply every boot so Desktop shortcuts
# actually render. Wait briefly for xfconfd to come up under the new bus.
for _ in $(seq 1 20); do
  xfconf-query -c xfce4-desktop -l >/dev/null 2>&1 && break
  sleep 0.25
done
xfconf-query -c xfce4-desktop -p /desktop-icons/style -s 2 --create -t int \
  2>/dev/null || true
# Reload xfdesktop so the style change takes effect immediately.
xfdesktop --reload 2>/dev/null || true

# ─────────────────────────────────────────────────────────────
# 8. websockify (noVNC) + optional Caddy
# ─────────────────────────────────────────────────────────────

# Resolve binding per NOVNC_BIND:
#   auto      -> tailscale if Tailscale IP known, else local
#   tailscale -> bind to the Tailscale IP only
#   public    -> bind 0.0.0.0 (compose must expose the port); Caddy fronts TLS
#   local     -> bind 127.0.0.1 only
#   off       -> don't start noVNC at all
if [ "$NOVNC_BIND" = "auto" ]; then
  if [ -n "$TAILSCALE_IP" ]; then
    NOVNC_BIND="tailscale"
  else
    NOVNC_BIND="local"
  fi
fi

NOVNC_LISTEN_ADDR=""
case "$NOVNC_BIND" in
  tailscale)
    if [ -n "$TAILSCALE_IP" ]; then
      NOVNC_LISTEN_ADDR="${TAILSCALE_IP}:6901"
    else
      log "NOVNC_BIND=tailscale but no Tailscale IP; falling back to local"
      NOVNC_LISTEN_ADDR="127.0.0.1:6901"
    fi
    ;;
  public) NOVNC_LISTEN_ADDR="0.0.0.0:6901" ;;
  local)  NOVNC_LISTEN_ADDR="127.0.0.1:6901" ;;
  off)    NOVNC_LISTEN_ADDR="" ;;
  *)      log "Unknown NOVNC_BIND=$NOVNC_BIND; defaulting to local"; NOVNC_LISTEN_ADDR="127.0.0.1:6901" ;;
esac

if [ -n "$NOVNC_LISTEN_ADDR" ]; then
  log "Starting websockify on $NOVNC_LISTEN_ADDR -> localhost:5901 ..."
  websockify --web=/usr/share/novnc "$NOVNC_LISTEN_ADDR" localhost:5901 \
    > "$HOME/.vnc/websockify.log" 2>&1 &
fi

# Warn when the gateway's desktop is reachable on 0.0.0.0 without TLS
# in front. This is fine for auth-gated proxies (Codespaces) and
# private networks, but dangerous on a VPS with a public IP. Caddy
# only fronts TLS when NOVNC_DOMAIN is set; without it, websockify
# is serving HTTP directly.
if [ "$NOVNC_BIND" = "public" ] && [ -z "${NOVNC_DOMAIN:-}" ]; then
  log "⚠ WARNING: noVNC bound to 0.0.0.0 without TLS."
  log "  This is only safe on networks you trust — Codespaces (auth-gated),"
  log "  local dev, or private networks. Do NOT use this on a VPS with a"
  log "  public IP. For production set NOVNC_DOMAIN (enables Caddy + Let's"
  log "  Encrypt) or use NOVNC_BIND=tailscale instead."
fi

if [ "$NOVNC_BIND" = "public" ] && [ -n "${NOVNC_DOMAIN:-}" ]; then
  log "Starting Caddy TLS front-end for $NOVNC_DOMAIN ..."
  cat > "$HOME/Caddyfile" << CADDYCFG
{
  admin off
  auto_https disable_redirects
}
${NOVNC_DOMAIN}:443 {
  reverse_proxy localhost:6901
  tls ${CADDY_EMAIL:-admin@${NOVNC_DOMAIN}}
}
CADDYCFG
  caddy run --config "$HOME/Caddyfile" > "$HOME/caddy.log" 2>&1 &
fi

# ─────────────────────────────────────────────────────────────
# 9. Register this gateway in Supabase
# ─────────────────────────────────────────────────────────────

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  log "Registering gateway $GATEWAY_ID in Supabase ..."
  REACHABLE_JSON=$(python3 - << PYEOF
import json, os
urls = {}
ts = os.environ.get("TS_IP", "")
if ts:
    urls["tailscale"] = f"http://{ts}:6901/vnc.html?autoconnect=1&resize=remote"
if os.environ.get("NOVNC_BIND_EFFECTIVE") == "public":
    dom = os.environ.get("NOVNC_DOMAIN", "")
    if dom:
        urls["public"] = f"https://{dom}/vnc.html?autoconnect=1&resize=remote"
urls["local"] = "http://localhost:6901/vnc.html?autoconnect=1&resize=remote"
meta = {
    "reachable_urls": urls,
    "novnc_bind": os.environ.get("NOVNC_BIND_EFFECTIVE", "local"),
    "version": os.environ.get("OPENCLAW_VERSION", ""),
    "tailscale_ip": ts or None,
    "exit_node": os.environ.get("TAILSCALE_EXIT_NODE", "") or None,
}
print(json.dumps(meta))
PYEOF
  )
  export TS_IP="$TAILSCALE_IP" NOVNC_BIND_EFFECTIVE="$NOVNC_BIND"
  # Upsert by slug; create if missing.
  curl -fsS -X POST \
    "$SUPABASE_URL/rest/v1/gateways?on_conflict=slug" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    -d "$(python3 -c "import json,os,sys; print(json.dumps({'slug': os.environ['GATEWAY_ID'], 'label': os.environ['GATEWAY_LABEL'], 'status': 'online', 'last_seen_at': __import__('datetime').datetime.utcnow().isoformat()+'Z', 'meta': json.loads(sys.stdin.read())}))" <<< "$REACHABLE_JSON")" \
    > /dev/null \
    && log "  registered" \
    || log "  registration failed (Supabase unreachable or gateways table missing — will retry from daemon)"
else
  log "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; skipping gateway registration."
fi

# ─────────────────────────────────────────────────────────────
# 10. Start files-API (only if GATEWAY_AUTH_TOKEN is set; else skip)
#     The files-API serves the agent worktrees to the HQ UI over
#     the Docker internal network (or Tailscale, if enabled).
# ─────────────────────────────────────────────────────────────

if [ -n "${GATEWAY_AUTH_TOKEN:-}" ] && [ "${FILES_API_BIND:-docker}" != "off" ]; then
  log "Starting files-API (bind=${FILES_API_BIND:-docker}) ..."
  FILES_API_BIND="${FILES_API_BIND:-docker}" \
  FILES_API_PORT="${FILES_API_PORT:-18790}" \
  GATEWAY_AUTH_TOKEN="$GATEWAY_AUTH_TOKEN" \
  TAILSCALE_SOCKET="${TAILSCALE_SOCKET:-}" \
  python3 /usr/local/bin/files_api.py > "$HOME/files-api.log" 2>&1 &
else
  log "files-API disabled (GATEWAY_AUTH_TOKEN empty or FILES_API_BIND=off)."
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

# ─────────────────────────────────────────────────────────────
# 12. Launch OpenClaw gateway as PID 1 (well, exec'd under tini)
# ─────────────────────────────────────────────────────────────

log "Starting openclaw gateway (foreground) ..."
# `openclaw gateway start` expects systemd; `openclaw gateway run` is the
# foreground command for containers.
#
# Export the X11/XDG environment so openclaw's managed browser launcher
# (which inherits process.env of the gateway) spawns Chrome into our
# Xtigervnc display. Without these, Chrome-in-container can't find a
# display and the wrapper reports "CDP websocket not reachable after
# start" even though the process briefly exists. The XFCE subshell
# above sets them locally; here we re-export for the openclaw process.
export DISPLAY=:1
export XDG_RUNTIME_DIR="/tmp/runtime-$(id -u)"
export XDG_SESSION_TYPE=x11
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
export XDG_CONFIG_DIRS="/etc/xdg"
export XDG_DATA_DIRS="/usr/local/share:/usr/share"
[ -S "$XDG_RUNTIME_DIR/bus" ] && \
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"

exec openclaw gateway run
