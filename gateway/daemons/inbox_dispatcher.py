#!/usr/bin/env python3
"""
Agent Inbox Dispatcher

Single process that runs on the OpenClaw host. Responsibilities:

1. Subscribe to Supabase Realtime on agent_inbox_items (INSERT events)
2. When a new inbox item arrives, determine if the agent needs a wake
3. Wake the agent's background inbox session via OpenClaw message CLI
4. Run periodic reconciliation to catch anything Realtime missed

The dispatcher does NOT process work. It only wakes agents.
The agent's background inbox session does the actual processing.

Environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  RECONCILE_INTERVAL    — seconds between reconciliation sweeps (default: 120)
  WAKE_COOLDOWN         — minimum seconds between wakes for the same agent (default: 30)

Install:
  pip install websocket-client

Run:
  python3 /app/inbox_dispatcher.py
"""

import json
import os
import subprocess
import sys
import time
import threading
from datetime import datetime, timezone

try:
    import websocket
except ImportError:
    print("Missing: pip install websocket-client", file=sys.stderr)
    sys.exit(1)

import urllib.request
import urllib.parse

try:
    from registry_config import resolve as resolve_hq_config
except ImportError:
    resolve_hq_config = None  # type: ignore[assignment]

# ── Config ─────────────────────────────────────────────────────────────
# Populated at main() startup from env OR the project registry fallback.

SUPABASE_URL = ""
SUPABASE_KEY = ""
RECONCILE_INTERVAL = int(os.environ.get("RECONCILE_INTERVAL", "120"))
WAKE_COOLDOWN = int(os.environ.get("WAKE_COOLDOWN", "30"))

# This gateway's slug — only wake agents bound to this gateway.
GATEWAY_ID = os.environ.get("GATEWAY_ID", "default")
# Cached set of agent IDs on this gateway. Refreshed periodically.
LOCAL_AGENT_IDS = set()
LOCAL_AGENT_IDS_LOCK = threading.Lock()

# Cached workspace slug — agents are registered in openclaw.json with
# id = "<workspace-slug>/<agent-slug>", so the dispatcher must prepend
# the workspace slug when invoking `openclaw agent --agent ...`.
WORKSPACE_SLUG = None

HEARTBEAT_INTERVAL = 30
RECONNECT_DELAY = 5
MAX_RECONNECT_DELAY = 60

# ── Supabase helpers ───────────────────────────────────────────────────


def api_get(table, params):
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/{table}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def api_patch(table, record_id, payload):
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/{table}?" + urllib.parse.urlencode({"id": f"eq.{record_id}"})
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }, method="PATCH", data=data)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def log(msg):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[{ts}] {msg}", flush=True)


def get_workspace_slug():
    global WORKSPACE_SLUG
    if WORKSPACE_SLUG is not None:
        return WORKSPACE_SLUG
    try:
        rows = api_get("workspace", {"select": "slug", "limit": "1"})
        WORKSPACE_SLUG = rows[0]["slug"] if rows and rows[0].get("slug") else ""
        if WORKSPACE_SLUG:
            log(f"Workspace slug: {WORKSPACE_SLUG}")
    except Exception as e:
        log(f"Failed to fetch workspace slug: {e}")
        WORKSPACE_SLUG = ""
    return WORKSPACE_SLUG


def resolve_agent_id(agent_slug):
    ws = get_workspace_slug()
    return f"{ws}/{agent_slug}" if ws else agent_slug


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ── Wake logic ─────────────────────────────────────────────────────────


class WakeTracker:
    """
    Decides whether an agent needs a wake based on:
    - Whether the agent has actionable inbox work (pending or retryable items)
    - Whether background processing already appears active (leased items)
    - Minimum cooldown between wakes to prevent spam
    """

    def __init__(self, cooldown_seconds):
        self.cooldown = cooldown_seconds
        self.last_wake = {}       # agent_slug -> timestamp
        self.wake_in_flight = {}  # agent_slug -> bool
        self.lock = threading.Lock()

    def should_wake(self, agent_slug, agent_id):
        with self.lock:
            # Cooldown check
            last = self.last_wake.get(agent_slug, 0)
            if (time.time() - last) < self.cooldown:
                return False, "cooldown"

            # Don't pile up wakes
            if self.wake_in_flight.get(agent_slug):
                return False, "wake_in_flight"

        # Check if agent already has active leases (background processing in progress)
        try:
            leased = api_get("agent_inbox_items", {
                "select": "id",
                "agent_id": f"eq.{agent_id}",
                "status": "eq.leased",
                "leased_until": f"gt.{now_iso()}",
                "limit": "1",
            })
            if leased:
                return False, "active_lease"
        except Exception:
            pass  # If we can't check, allow the wake

        # Check if there's actually actionable work
        try:
            actionable = api_get("agent_inbox_items", {
                "select": "id",
                "agent_id": f"eq.{agent_id}",
                "or": "(status.eq.pending,and(status.eq.failed,attempt_count.lt.3))",
                "limit": "1",
            })
            if not actionable:
                return False, "no_actionable_work"
        except Exception:
            pass  # If we can't check, allow the wake

        return True, "ok"

    def record_wake_start(self, agent_slug):
        with self.lock:
            self.wake_in_flight[agent_slug] = True

    def record_wake_done(self, agent_slug, success):
        with self.lock:
            self.wake_in_flight[agent_slug] = False
            if success:
                self.last_wake[agent_slug] = time.time()


def wake_agent(agent_slug, agent_id, reason, tracker):
    """Wake an agent's background inbox session via OpenClaw."""
    should, skip_reason = tracker.should_wake(agent_slug, agent_id)
    if not should:
        log(f"Skipping wake for {agent_slug} ({skip_reason})")
        return False

    tracker.record_wake_start(agent_slug)

    message = (
        f"[inbox] {reason}\n\n"
        f"Process your inbox:\n"
        f"1. python3 skills/hq/scripts/hq_inbox_process.py\n"
        f"2. Handle each item, then mark done or escalate\n"
        f"3. Continue until inbox is empty or batch limit reached"
    )

    openclaw_agent_id = resolve_agent_id(agent_slug)
    try:
        cmd = [
            "openclaw", "agent",
            "--agent", openclaw_agent_id,
            "--message", message,
        ]
        # Fire and forget — don't block the dispatcher waiting for the agent to finish
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        tracker.record_wake_done(agent_slug, True)
        log(f"Woke {agent_slug}: {reason}")
        return True
    except Exception as e:
        tracker.record_wake_done(agent_slug, False)
        log(f"Wake error for {agent_slug}: {e}")
        return False


# ── Reconciliation ─────────────────────────────────────────────────────


def refresh_local_agents():
    """Cache the set of agent IDs bound to this gateway. Called on startup
    and periodically so new agents provisioned through the UI are picked up."""
    try:
        rows = api_get("agents", {
            "select": "id",
            "gateway_id": f"eq.(select id from gateways where slug='{GATEWAY_ID}')",
        })
    except Exception:
        # The "eq.(select …)" trick doesn't work in PostgREST; fall back to
        # a two-step resolve.
        try:
            gw = api_get("gateways", {"select": "id", "slug": f"eq.{GATEWAY_ID}", "limit": "1"})
            if not gw:
                return
            gateway_uuid = gw[0]["id"]
            rows = api_get("agents", {
                "select": "id",
                "gateway_id": f"eq.{gateway_uuid}",
            })
        except Exception as e:
            log(f"refresh_local_agents error: {e}")
            return
    ids = {r["id"] for r in rows}
    with LOCAL_AGENT_IDS_LOCK:
        LOCAL_AGENT_IDS.clear()
        LOCAL_AGENT_IDS.update(ids)


def is_local_agent(agent_id):
    with LOCAL_AGENT_IDS_LOCK:
        return agent_id in LOCAL_AGENT_IDS


def reconcile(tracker):
    """
    Safety sweep: find agents *on this gateway* with pending/retryable inbox
    items that haven't been woken recently. Wake them.
    """
    refresh_local_agents()
    try:
        # Find all agents with actionable inbox items
        items = api_get("agent_inbox_items", {
            "select": "agent_slug,agent_id",
            "or": "(status.eq.pending,and(status.eq.failed,attempt_count.lt.3))",
            "limit": "100",
        })

        # Dedupe by agent and filter to this gateway's agents
        agents_needing_wake = {}
        for item in items:
            agent_id = item["agent_id"]
            slug = item["agent_slug"]
            if not is_local_agent(agent_id):
                continue
            if slug not in agents_needing_wake:
                agents_needing_wake[slug] = agent_id

        for slug, agent_id in agents_needing_wake.items():
            wake_agent(slug, agent_id, "Reconciliation: pending inbox items found", tracker)

        if agents_needing_wake:
            log(f"Reconciliation: checked {len(agents_needing_wake)} agent(s): {', '.join(agents_needing_wake.keys())}")

    except Exception as e:
        log(f"Reconciliation error: {e}")


def start_reconciliation_loop(tracker):
    def loop():
        while True:
            time.sleep(RECONCILE_INTERVAL)
            reconcile(tracker)
    t = threading.Thread(target=loop, daemon=True)
    t.start()
    log(f"Reconciliation loop started (every {RECONCILE_INTERVAL}s)")


# ── Realtime listener ──────────────────────────────────────────────────


class InboxDispatcher:
    def __init__(self, tracker):
        self.tracker = tracker
        self.ws = None
        self.ref = 0
        self.reconnect_delay = RECONNECT_DELAY

    def _next_ref(self):
        self.ref += 1
        return str(self.ref)

    def _ws_url(self):
        base = SUPABASE_URL.rstrip("/")
        base = base.replace("https://", "wss://").replace("http://", "ws://")
        return f"{base}/realtime/v1/websocket?apikey={SUPABASE_KEY}&vsn=1.0.0"

    def _send(self, topic, event, payload):
        msg = json.dumps({
            "topic": topic, "event": event,
            "payload": payload, "ref": self._next_ref(),
        })
        if self.ws:
            self.ws.send(msg)

    def _start_heartbeat(self):
        def beat():
            while self.ws:
                try:
                    self._send("phoenix", "heartbeat", {})
                except Exception:
                    break
                time.sleep(HEARTBEAT_INTERVAL)
        threading.Thread(target=beat, daemon=True).start()

    def _on_open(self, ws):
        log("Connected to Supabase Realtime")
        self.reconnect_delay = RECONNECT_DELAY

        # Subscribe to new inbox items only
        self._send("realtime:public:agent_inbox_items", "phx_join", {
            "config": {"postgres_changes": [{
                "event": "INSERT",
                "schema": "public",
                "table": "agent_inbox_items",
            }]}
        })

        self._start_heartbeat()
        log("Listening for inbox item inserts")

    def _on_message(self, ws, raw):
        try:
            msg = json.loads(raw)
        except Exception:
            return

        if msg.get("event") == "postgres_changes":
            data = msg.get("payload", {}).get("data", {})
            if data.get("table") == "agent_inbox_items" and data.get("type") == "INSERT":
                record = data.get("record", {})
                self._handle_new_item(record)

    def _handle_new_item(self, record):
        agent_slug = record.get("agent_slug")
        agent_id = record.get("agent_id")
        event_type = record.get("event_type")
        summary = record.get("summary", "")
        item_id = record.get("id")

        if not agent_slug or not agent_id:
            return

        # Ignore items for agents on other gateways.
        if not is_local_agent(agent_id):
            # Refresh once in case the agent was just provisioned here.
            refresh_local_agents()
            if not is_local_agent(agent_id):
                return

        log(f"New inbox item for {agent_slug}: {event_type} — {summary}")

        # Update wake tracking on the item
        try:
            api_patch("agent_inbox_items", item_id, {
                "last_wake_attempt_at": now_iso(),
            })
        except Exception:
            pass

        success = wake_agent(agent_slug, agent_id, f"New: {summary}", self.tracker)

        if success:
            try:
                api_patch("agent_inbox_items", item_id, {
                    "last_wake_success_at": now_iso(),
                })
            except Exception:
                pass

    def _on_error(self, ws, error):
        log(f"WebSocket error: {error}")

    def _on_close(self, ws, close_status, close_msg):
        log(f"Disconnected: {close_status} {close_msg}")
        self.ws = None

    def run(self):
        while True:
            try:
                self.ws = websocket.WebSocketApp(
                    self._ws_url(),
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                )
                self.ws.run_forever(ping_interval=20, ping_timeout=10)
            except Exception as e:
                log(f"Connection failed: {e}")

            log(f"Reconnecting in {self.reconnect_delay}s...")
            time.sleep(self.reconnect_delay)
            self.reconnect_delay = min(self.reconnect_delay * 2, MAX_RECONNECT_DELAY)


# ── Main ───────────────────────────────────────────────────────────────


def wait_for_supabase_config():
    """Populate SUPABASE_URL + SUPABASE_KEY globals, blocking until resolved.

    Same model as command_runner.py — env vars first, registry fallback
    with polling. Lets the dispatcher start before the user has done
    browser onboarding.
    """
    global SUPABASE_URL, SUPABASE_KEY

    env_url = os.environ.get("SUPABASE_URL", "").strip()
    env_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if env_url and env_key:
        SUPABASE_URL = env_url
        SUPABASE_KEY = env_key
        return

    if resolve_hq_config is None:
        print(
            "Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and registry_config.py "
            "helper is not available",
            file=sys.stderr,
        )
        sys.exit(1)

    log("Supabase env not set; waiting for project registry at /config ...")
    waited = 0
    while True:
        cfg = resolve_hq_config()
        if cfg is not None:
            SUPABASE_URL = cfg.url
            SUPABASE_KEY = cfg.service_role_key
            log(f"  resolved from {cfg.source}")
            return
        if waited > 0 and waited % 30 == 0:
            log(f"  still waiting for onboarding ({waited}s) — complete it in the UI")
        time.sleep(5)
        waited += 5


def main():
    wait_for_supabase_config()

    log(f"Starting inbox dispatcher for gateway={GATEWAY_ID}")

    # Pre-fetch workspace slug so wake calls use the prefixed openclaw id.
    get_workspace_slug()

    # Cache which agents are on this gateway.
    refresh_local_agents()
    log(f"Local agents on this gateway: {len(LOCAL_AGENT_IDS)}")

    tracker = WakeTracker(WAKE_COOLDOWN)

    # Run initial reconciliation to catch anything from before startup
    reconcile(tracker)

    # Start periodic reconciliation
    start_reconciliation_loop(tracker)

    # Start Realtime listener
    dispatcher = InboxDispatcher(tracker)
    dispatcher.run()


if __name__ == "__main__":
    main()
