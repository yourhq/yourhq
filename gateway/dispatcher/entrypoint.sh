#!/bin/sh
# Dispatcher entrypoint — creates a local openclaw config that connects to the
# gateway container in remote mode, then runs the dispatcher daemon.

GATEWAY_HOST="${OPENCLAW_GATEWAY_HOST:-gateway}"
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
CONFIG_DIR="$HOME/.openclaw"
LOCAL_CONFIG="$CONFIG_DIR/openclaw.json"
PATCHED_CONFIG="$CONFIG_DIR/openclaw-dispatcher.json"

# Wait for the gateway to write its config (shared volume).
echo "[dispatcher] Waiting for gateway config at $LOCAL_CONFIG ..."
while [ ! -f "$LOCAL_CONFIG" ]; do
  sleep 2
done
echo "[dispatcher] Gateway config found"

# Layer remote-mode override on top so `openclaw agent` connects to the
# gateway container instead of trying localhost.
cp "$LOCAL_CONFIG" "$PATCHED_CONFIG"
python3 -c "
import json, sys
with open(sys.argv[1], 'r') as f:
    cfg = json.load(f)
cfg.setdefault('gateway', {})
cfg['gateway']['mode'] = 'remote'
cfg['gateway'].setdefault('remote', {})
cfg['gateway']['remote']['url'] = 'ws://${GATEWAY_HOST}:${GATEWAY_PORT}'
with open(sys.argv[1], 'w') as f:
    json.dump(cfg, f, indent=2)
" "$PATCHED_CONFIG"

export OPENCLAW_CONFIG_PATH="$PATCHED_CONFIG"
echo "[dispatcher] Patched config at $PATCHED_CONFIG (remote -> ws://$GATEWAY_HOST:$GATEWAY_PORT)"

exec python3 /app/inbox_dispatcher.py
