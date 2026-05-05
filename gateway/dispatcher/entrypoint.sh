#!/bin/sh
# Dispatcher entrypoint — creates a local openclaw config that connects to the
# gateway container in remote mode, then runs the dispatcher daemon.

GATEWAY_HOST="${OPENCLAW_GATEWAY_HOST:-gateway}"
GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
CONFIG_DIR="$HOME/.openclaw"
LOCAL_CONFIG="$CONFIG_DIR/openclaw.json"

# If a shared config exists (mounted from gateway-state volume), layer our
# remote-mode override on top. Otherwise create a minimal config.
if [ -f "$LOCAL_CONFIG" ]; then
  TMP=$(mktemp)
  cp "$LOCAL_CONFIG" "$TMP"
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
" "$TMP"
  # Use this patched copy instead of the shared volume version
  export OPENCLAW_CONFIG_PATH="$TMP"
fi

exec python3 /app/inbox_dispatcher.py
