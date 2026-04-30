# Heartbeat System

## Overview

Both gateway daemons maintain heartbeats to signal liveness. This enables the UI to detect stale gateways and Docker to detect crashed containers.

## Two heartbeat mechanisms

### 1. Supabase heartbeat (command runner only)

The command runner daemon upserts `gateways.last_seen_at` every 30 seconds via the PostgREST API. This is the primary signal the UI uses to determine gateway health.

**Pause-aware:** If the gateway's status is `paused` or `hibernating`, the daemon only updates `last_seen_at` without overwriting the status back to `ready`. This preserves user-initiated pauses.

### 2. Local heartbeat file (both daemons)

Both the command runner and inbox dispatcher write the current ISO timestamp to `/tmp/heartbeat.txt` every 30 seconds. This file is consumed by Docker healthchecks.

**Docker healthcheck example:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD test $(( $(date +%s) - $(date -d "$(cat /tmp/heartbeat.txt)" +%s) )) -lt 90
```

The file exists independently of network connectivity — if the daemon process is alive, the file is fresh.

## Freshness threshold

The UI considers a heartbeat stale after **90 seconds** (`HEARTBEAT_FRESH_SECONDS` in `apps/ui/src/lib/gateways/types.ts`). Since the daemon writes every 30s, this allows up to 2 missed heartbeats before marking stale.

A gateway with status `ready` but a stale heartbeat is displayed as `error` (red) in the UI with a "stale" badge.

## Gateway detail page

The gateway detail sidebar shows a **Heartbeat** property with:
- **Healthy** (green) — `last_seen_at` is within 90 seconds
- **Stale** (amber) — status is `ready` but heartbeat is old
- **No signal** — `last_seen_at` is null (gateway has never reported)

## Structured JSON logs

Both daemons emit structured JSON logs to stdout. Each log entry includes:

```json
{
  "ts": "2026-04-30T12:00:00Z",
  "level": "info",
  "daemon": "command_runner",
  "gateway_id": "default",
  "tenant_id": "00000000-0000-0000-0000-000000000000",
  "msg": "heartbeat failed: ..."
}
```

Use `docker compose logs -f` or a log aggregator to monitor daemon health.
