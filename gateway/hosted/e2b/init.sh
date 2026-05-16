#!/usr/bin/env bash
# E2B platform init hook.
# E2B runs start_cmd as "user" (HOME=/home/user) regardless of the
# Dockerfile USER directive. Repoint HOME to the openclaw home dir
# where the image's files actually live.
if [ -d /home/openclaw ]; then
  export HOME=/home/openclaw
  chmod -R o+rwX /home/openclaw 2>/dev/null || true
fi
exec > >(tee -a /tmp/entrypoint.log) 2>&1
set -x
trap 'echo "[entrypoint] FATAL: exiting due to error on line $LINENO (exit $?)" | tee -a /tmp/entrypoint.log; kill -TERM $(jobs -p) 2>/dev/null || true; exit 1' ERR
