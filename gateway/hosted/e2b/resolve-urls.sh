#!/usr/bin/env bash
# E2B URL resolution hook.
# The E2B provider writes /tmp/sandbox-host with the sandbox's public
# base URL after creation. This hook waits for it and builds
# E2B's port-prefixed URLs for gateway registration.
if [ -z "${SANDBOX_HOST:-}" ]; then
  log "Waiting for /tmp/sandbox-host (written by provider) ..."
  for _i in $(seq 1 60); do
    [ -f /tmp/sandbox-host ] && break
    sleep 1
  done
  if [ -f /tmp/sandbox-host ]; then
    SANDBOX_HOST="$(cat /tmp/sandbox-host)"
    export SANDBOX_HOST
  fi
fi

if [ -n "${SANDBOX_HOST:-}" ]; then
  base="${SANDBOX_HOST%/}"
  [[ "$base" != http* ]] && base="https://$base"
  REACHABLE_BASE="$base"
  REACHABLE_FILES_API="${base/https:\/\//https://18790-}"
  REACHABLE_NOVNC="${base/https:\/\//https://6901-}/vnc.html?autoconnect=1&resize=remote"
  export REACHABLE_BASE REACHABLE_FILES_API REACHABLE_NOVNC
fi
