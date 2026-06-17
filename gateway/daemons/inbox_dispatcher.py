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
import threading
import time
from datetime import datetime, timezone

try:
    import websocket
except ImportError:
    print("Missing: pip install websocket-client", file=sys.stderr)
    sys.exit(1)

import urllib.parse
import urllib.request

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
MAX_WAKE_COOLDOWN = int(os.environ.get("MAX_WAKE_COOLDOWN", "900"))  # 15 min cap
MAX_CONSECUTIVE_FAILURES = int(os.environ.get("MAX_CONSECUTIVE_FAILURES", "5"))
STALE_ITEM_AGE_HOURS = int(os.environ.get("STALE_ITEM_AGE_HOURS", "24"))
MAX_CONCURRENT_WAKES = int(os.environ.get("MAX_CONCURRENT_WAKES", "2"))
AGENT_PROCESS_TIMEOUT = int(os.environ.get("AGENT_PROCESS_TIMEOUT", "300"))  # 5 min


# This gateway's slug — only wake agents bound to this gateway.
# Prefer process env, fall back to gateway.env so daemons restarted
# outside the entrypoint still get the right ID.
def _resolve_gateway_id():
    gid = os.environ.get("GATEWAY_ID")
    if gid and gid != "default":
        return gid
    _state = os.environ.get("OPENCLAW_HOME", os.path.expanduser("~/.openclaw"))
    _gw_env = os.path.join(_state, "secrets", "gateway.env")
    if os.path.isfile(_gw_env):
        with open(_gw_env) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GATEWAY_ID="):
                    val = line.split("=", 1)[1].strip("'\"")
                    if val:
                        return val
    return gid or "default"


GATEWAY_ID = _resolve_gateway_id()

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000000"
TENANT_ID = os.environ.get("TENANT_ID", DEFAULT_TENANT_ID)
# Cached set of agent IDs on this gateway. Refreshed periodically.
LOCAL_AGENT_IDS = set()
LOCAL_AGENT_SLUG_TO_ID = {}  # slug -> uuid
LOCAL_AGENT_IDS_LOCK = threading.Lock()

HEARTBEAT_INTERVAL = 30
RECONNECT_DELAY = 5
MAX_RECONNECT_DELAY = 60

# ── Supabase helpers ───────────────────────────────────────────────────


def api_get(table, params):
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/{table}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def api_patch(table, record_id, payload):
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/{table}?" + urllib.parse.urlencode({"id": f"eq.{record_id}"})
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
        data=data,
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def log(msg, level="info", **extra):
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "level": level,
        "daemon": "inbox_dispatcher",
        "gateway_id": GATEWAY_ID,
        "tenant_id": TENANT_ID,
        "msg": msg,
    }
    if extra:
        entry.update(extra)
    print(json.dumps(entry, default=str), flush=True)


OPENCLAW_CONFIG = os.path.join(
    os.environ.get("OPENCLAW_HOME", os.path.expanduser("~/.openclaw")),
    "openclaw.json",
)


def resolve_agent_id(agent_slug):
    """Map an HQ agent slug to the id openclaw has the agent registered under.

    openclaw >=6.x registers agents as {workspace-slug}/{agent-slug}
    (add-agent.sh writes that id into agents.list), so waking the bare slug
    silently targets a nonexistent agent. Look the slug up in openclaw.json
    and return the registered id with slashes normalized to dashes — the
    CLI addresses agents in the dash form (`openclaw status` shows
    prajoth-hq-alex for a config id of prajoth-hq/alex). Fall back to the
    bare slug if no entry matches (agent not yet provisioned).
    """
    try:
        with open(OPENCLAW_CONFIG) as f:
            cfg = json.load(f)
        entries = cfg.get("agents", {}).get("list") or []
        for entry in entries:
            if (entry.get("id") or "") == agent_slug:
                return agent_slug
        for entry in entries:
            aid = entry.get("id") or ""
            if aid.endswith("/" + agent_slug) or aid.endswith("-" + agent_slug):
                return aid.replace("/", "-")
    except Exception as e:
        print(
            f"[dispatcher] resolve_agent_id failed for '{agent_slug}' using {OPENCLAW_CONFIG}: {e}; "
            "falling back to bare slug",
            file=sys.stderr,
        )
    return agent_slug


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ── Wake logic ─────────────────────────────────────────────────────────


class WakeTracker:
    """
    Decides whether an agent needs a wake based on:
    - Whether the agent has actionable inbox work (pending or retryable items)
    - Whether background processing already appears active (leased items)
    - Minimum cooldown between wakes to prevent spam
    - Exponential backoff on repeated failures (prevents runaway CPU loops)
    - Global concurrency cap to protect the instance from OOM
    - Process timeout to kill hung agent processes
    - Hard give-up after MAX_CONSECUTIVE_FAILURES → stall items + notify operator
    """

    def __init__(self, cooldown_seconds):
        self.cooldown = cooldown_seconds
        self.last_wake = {}  # agent_slug -> timestamp
        self.wake_in_flight = {}  # agent_slug -> (subprocess.Popen, start_time) | None
        self.consecutive_failures = {}  # agent_slug -> int
        self.stalled_agents = set()  # agents that hit the give-up threshold
        self.stalled_cleaned = set()  # stalled agents whose items have been marked
        self.concurrency_waitlist = []  # (agent_slug, agent_id) tuples waiting for a slot
        self.lock = threading.Lock()

    def _effective_cooldown(self, agent_slug):
        failures = self.consecutive_failures.get(agent_slug, 0)
        if failures == 0:
            return self.cooldown
        return min(self.cooldown * (2**failures), MAX_WAKE_COOLDOWN)

    def _active_process_count(self):
        """Count agent processes currently in flight. Must be called under self.lock."""
        count = 0
        for entry in self.wake_in_flight.values():
            if entry is not None:
                proc, _ = entry
                if proc.poll() is None:
                    count += 1
        return count

    def _reap_in_flight(self, agent_slug):
        """Check if a previously launched agent process has finished and
        whether it succeeded or failed. Kills hung processes that exceed
        the timeout. Must be called under self.lock."""
        entry = self.wake_in_flight.get(agent_slug)
        if entry is None:
            return
        proc, start_time = entry
        rc = proc.poll()

        # Kill hung processes
        if rc is None and (time.time() - start_time) > AGENT_PROCESS_TIMEOUT:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
            log(
                f"Killed hung agent process for {agent_slug} "
                f"(ran {int(time.time() - start_time)}s, limit {AGENT_PROCESS_TIMEOUT}s)",
                level="warn",
            )
            rc = -1  # treat as failure

        if rc is None:
            return  # still running within timeout

        self.wake_in_flight[agent_slug] = None
        if rc == 0:
            self.consecutive_failures[agent_slug] = 0
            self.stalled_agents.discard(agent_slug)
            self.stalled_cleaned.discard(agent_slug)
        else:
            prev = self.consecutive_failures.get(agent_slug, 0)
            self.consecutive_failures[agent_slug] = prev + 1
            cd = self._effective_cooldown(agent_slug)
            log(
                f"Agent {agent_slug} wake exited with code {rc} (failure #{prev + 1}, next cooldown {cd}s)",
                level="warn",
            )
            if prev + 1 >= MAX_CONSECUTIVE_FAILURES:
                self.stalled_agents.add(agent_slug)
                log(
                    f"Agent {agent_slug} stalled after {prev + 1} consecutive failures — "
                    f"giving up until new context arrives",
                    level="error",
                )

    def reap_all_in_flight(self):
        """Sweep all tracked processes for timeouts. Called from reconciliation."""
        with self.lock:
            for slug in list(self.wake_in_flight.keys()):
                self._reap_in_flight(slug)

    def drain_waitlist(self):
        """Pop agents from the concurrency waitlist and return those that
        now have a free slot. Caller is responsible for calling wake_agent."""
        ready = []
        with self.lock:
            # Remove stalled agents from the waitlist first
            self.concurrency_waitlist = [(s, a) for s, a in self.concurrency_waitlist if s not in self.stalled_agents]
            while self.concurrency_waitlist and self._active_process_count() < MAX_CONCURRENT_WAKES:
                slug, agent_id = self.concurrency_waitlist.pop(0)
                ready.append((slug, agent_id))
        return ready

    def get_uncleaned_stalled_agents(self):
        """Return stalled agents whose items haven't been marked yet."""
        with self.lock:
            return self.stalled_agents - self.stalled_cleaned

    def mark_stalled_cleaned(self, agent_slug):
        """Record that we've already marked this stalled agent's items."""
        with self.lock:
            self.stalled_cleaned.add(agent_slug)

    def reset_backoff(self, agent_slug):
        """Reset backoff for an agent when context changes (new inbox item,
        provider cooldown expired, etc). Clears stalled state too."""
        with self.lock:
            self.consecutive_failures[agent_slug] = 0
            self.stalled_agents.discard(agent_slug)
            self.stalled_cleaned.discard(agent_slug)

    def should_wake(self, agent_slug, agent_id):
        with self.lock:
            self._reap_in_flight(agent_slug)

            # Agent hit give-up threshold
            if agent_slug in self.stalled_agents:
                return False, "stalled"

            # Still running from last wake
            if self.wake_in_flight.get(agent_slug) is not None:
                return False, "wake_in_flight"

            # Global concurrency cap — add to waitlist instead of silently dropping
            if self._active_process_count() >= MAX_CONCURRENT_WAKES:
                if not any(s == agent_slug for s, _ in self.concurrency_waitlist):
                    self.concurrency_waitlist.append((agent_slug, agent_id))
                return False, "concurrency_limit"

            # Cooldown check (exponential on failures)
            last = self.last_wake.get(agent_slug, 0)
            cd = self._effective_cooldown(agent_slug)
            if (time.time() - last) < cd:
                return False, f"cooldown({cd}s)"

        # Skip paused or hibernating agents
        try:
            agent_rows = api_get(
                "agents",
                {
                    "select": "status",
                    "id": f"eq.{agent_id}",
                    "limit": "1",
                },
            )
            if agent_rows and agent_rows[0].get("status") in ("paused", "hibernating"):
                return False, "agent_paused"
        except Exception:
            pass

        # Check if agent already has active leases (background processing in progress)
        try:
            leased = api_get(
                "agent_inbox_items",
                {
                    "select": "id",
                    "agent_id": f"eq.{agent_id}",
                    "status": "eq.leased",
                    "leased_until": f"gt.{now_iso()}",
                    "limit": "1",
                },
            )
            if leased:
                return False, "active_lease"
        except Exception:
            pass  # If we can't check, allow the wake

        # Budget enforcement (Ring 2 — plugin's before_prompt_build is Ring 1)
        try:
            budget_rows = api_get(
                "agent_budgets",
                {
                    "select": "status,hard_cutoff",
                    "agent_id": f"eq.{agent_id}",
                    "limit": "1",
                },
            )
            if budget_rows and budget_rows[0].get("status") == "exceeded" and budget_rows[0].get("hard_cutoff"):
                return False, "budget_exceeded"
        except Exception:
            pass  # fail open — plugin will catch it

        # Check if there's actually actionable work
        try:
            actionable = api_get(
                "agent_inbox_items",
                {
                    "select": "id",
                    "agent_id": f"eq.{agent_id}",
                    "or": f"(status.eq.pending,and(status.eq.failed,attempt_count.lt.3),and(status.eq.leased,leased_until.lt.{now_iso()}))",
                    "limit": "1",
                },
            )
            if not actionable:
                with self.lock:
                    self.consecutive_failures[agent_slug] = 0
                    self.stalled_agents.discard(agent_slug)
                    self.stalled_cleaned.discard(agent_slug)
                return False, "no_actionable_work"
        except Exception:
            pass  # If we can't check, allow the wake

        return True, "ok"

    def record_wake_start(self, agent_slug, proc=None):
        with self.lock:
            self.wake_in_flight[agent_slug] = (proc, time.time()) if proc else None
            self.last_wake[agent_slug] = time.time()

    def record_wake_done(self, agent_slug, success):
        with self.lock:
            self.wake_in_flight[agent_slug] = None
            if success:
                self.last_wake[agent_slug] = time.time()
            else:
                prev = self.consecutive_failures.get(agent_slug, 0)
                self.consecutive_failures[agent_slug] = prev + 1


def wake_agent(agent_slug, agent_id, reason, tracker, context=None):
    """Wake an agent's background inbox session via OpenClaw."""
    should, skip_reason = tracker.should_wake(agent_slug, agent_id)
    if not should:
        log(f"Skipping wake for {agent_slug} ({skip_reason})")
        return False

    message = (
        f"[inbox] {reason}\n\n"
        f"Process your inbox. Run each command exactly as shown (no cd, no bash -c wrapper):\n"
        f"1. python3 skills/hq/scripts/hq_inbox_process.py\n"
        f"2. Handle each item, then mark done or escalate\n"
        f"3. Continue until inbox is empty or batch limit reached"
    )

    openclaw_agent_id = resolve_agent_id(agent_slug)
    try:
        cmd = [
            "openclaw",
            "agent",
            "--agent",
            openclaw_agent_id,
            "--message",
            message,
        ]
        ctx = context or {}
        model_override = ctx.get("model_override")
        thinking_override = ctx.get("thinking_override")
        if model_override:
            cmd += ["--model", model_override]
        if thinking_override:
            cmd += ["--thinking", thinking_override]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        tracker.record_wake_start(agent_slug, proc)
        extra = ""
        if model_override or thinking_override:
            parts = []
            if model_override:
                parts.append(f"model={model_override}")
            if thinking_override:
                parts.append(f"thinking={thinking_override}")
            extra = f" [{', '.join(parts)}]"
        log(f"Woke {agent_slug}: {reason}{extra}")
        return True
    except Exception as e:
        tracker.record_wake_done(agent_slug, False)
        log(f"Wake error for {agent_slug}: {e}")
        try:
            from sentry_init import capture

            capture(e)
        except ImportError:
            pass
        return False


# ── Reconciliation ─────────────────────────────────────────────────────


def refresh_local_agents():
    """Cache the set of agent IDs bound to this gateway. Called on startup
    and periodically so new agents provisioned through the UI are picked up."""
    try:
        rows = api_get(
            "agents",
            {
                "select": "id,slug",
                "gateway_id": f"eq.(select id from gateways where slug='{GATEWAY_ID}')",
            },
        )
    except Exception:
        try:
            gw = api_get("gateways", {"select": "id", "slug": f"eq.{GATEWAY_ID}", "limit": "1"})
            if not gw:
                return
            gateway_uuid = gw[0]["id"]
            rows = api_get(
                "agents",
                {
                    "select": "id,slug",
                    "gateway_id": f"eq.{gateway_uuid}",
                },
            )
        except Exception as e:
            log(f"refresh_local_agents error: {e}")
            return
    ids = {r["id"] for r in rows}
    slug_map = {r["slug"]: r["id"] for r in rows if r.get("slug")}
    with LOCAL_AGENT_IDS_LOCK:
        LOCAL_AGENT_IDS.clear()
        LOCAL_AGENT_IDS.update(ids)
        LOCAL_AGENT_SLUG_TO_ID.clear()
        LOCAL_AGENT_SLUG_TO_ID.update(slug_map)


def is_local_agent(agent_id):
    with LOCAL_AGENT_IDS_LOCK:
        return agent_id in LOCAL_AGENT_IDS


def _expire_stale_items():
    """Mark pending/failed inbox items older than STALE_ITEM_AGE_HOURS as failed.
    Prevents the dispatcher from endlessly retrying items that will never succeed."""
    if STALE_ITEM_AGE_HOURS <= 0:
        return 0
    cutoff = datetime.now(timezone.utc) - __import__("datetime").timedelta(hours=STALE_ITEM_AGE_HOURS)
    cutoff_iso = cutoff.replace(microsecond=0).isoformat()
    try:
        url = (
            SUPABASE_URL.rstrip("/")
            + "/rest/v1/agent_inbox_items?"
            + urllib.parse.urlencode(
                {
                    "status": "eq.pending",
                    "created_at": f"lt.{cutoff_iso}",
                }
            )
        )
        data = json.dumps(
            {
                "status": "failed",
                "failed_at": now_iso(),
                "attempt_count": 3,
            }
        ).encode()
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            method="PATCH",
            data=data,
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            expired = json.loads(r.read().decode())
        if expired:
            slugs = {i.get("agent_slug", "?") for i in expired}
            log(f"Expired {len(expired)} stale inbox item(s) older than {STALE_ITEM_AGE_HOURS}h: {', '.join(slugs)}")
        return len(expired) if isinstance(expired, list) else 0
    except Exception as e:
        log(f"Stale item expiry error: {e}", level="warn")
        return 0


def _stall_agent_items(agent_slug, agent_id):
    """Mark all pending items for a stalled agent and create a notification
    so the operator knows the agent is stuck."""
    try:
        url = (
            SUPABASE_URL.rstrip("/")
            + "/rest/v1/agent_inbox_items?"
            + urllib.parse.urlencode(
                {
                    "agent_id": f"eq.{agent_id}",
                    "status": "eq.pending",
                }
            )
        )
        data = json.dumps(
            {
                "status": "failed",
                "failed_at": now_iso(),
                "attempt_count": MAX_CONSECUTIVE_FAILURES,
            }
        ).encode()
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            method="PATCH",
            data=data,
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            stalled = json.loads(r.read().decode())
        count = len(stalled) if isinstance(stalled, list) else 0
        if count:
            log(f"Marked {count} pending item(s) as failed for stalled agent {agent_slug}")
    except Exception as e:
        log(f"Failed to stall items for {agent_slug}: {e}", level="warn")


def reconcile(tracker):
    """
    Safety sweep: find agents *on this gateway* with pending/retryable inbox
    items that haven't been woken recently. Wake them.
    Also expires stale items, reaps hung processes, and handles stalled agents.
    """
    refresh_local_agents()
    _expire_stale_items()
    tracker.reap_all_in_flight()

    # Handle stalled agents — mark their pending items as failed (once)
    needs_cleanup = tracker.get_uncleaned_stalled_agents()
    if needs_cleanup:
        with LOCAL_AGENT_IDS_LOCK:
            slug_map = dict(LOCAL_AGENT_SLUG_TO_ID)
        for slug in needs_cleanup:
            agent_id = slug_map.get(slug)
            if agent_id:
                _stall_agent_items(slug, agent_id)
            tracker.mark_stalled_cleaned(slug)

    # Drain concurrency waitlist — wake agents that were queued behind the cap
    for slug, agent_id in tracker.drain_waitlist():
        wake_agent(slug, agent_id, "Concurrency slot freed — processing queued work", tracker)

    try:
        items = api_get(
            "agent_inbox_items",
            {
                "select": "agent_slug,agent_id",
                "or": f"(status.eq.pending,and(status.eq.failed,attempt_count.lt.3),and(status.eq.leased,leased_until.lt.{now_iso()}))",
                "limit": "100",
            },
        )

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


def start_slot_watcher(tracker):
    """Short-interval loop that reaps finished processes and drains the
    concurrency waitlist. Only does real work when agents are queued —
    otherwise it's just a cheap poll() call on tracked Popen objects."""

    def loop():
        while True:
            time.sleep(5)
            tracker.reap_all_in_flight()
            for slug, agent_id in tracker.drain_waitlist():
                wake_agent(slug, agent_id, "Concurrency slot freed", tracker)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


HEARTBEAT_FILE = "/tmp/heartbeat.txt"


def start_heartbeat_file_loop():
    def loop():
        while True:
            try:
                with open(HEARTBEAT_FILE, "w") as f:
                    f.write(now_iso())
            except OSError:
                pass
            time.sleep(HEARTBEAT_INTERVAL)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


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
        msg = json.dumps(
            {
                "topic": topic,
                "event": event,
                "payload": payload,
                "ref": self._next_ref(),
            }
        )
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
        self._send(
            "realtime:public:agent_inbox_items",
            "phx_join",
            {
                "config": {
                    "postgres_changes": [
                        {
                            "event": "INSERT",
                            "schema": "public",
                            "table": "agent_inbox_items",
                        }
                    ]
                }
            },
        )

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

        # New context → reset backoff so the agent gets a fresh chance.
        # If the agent was stalled from prior failures, a new item means
        # the situation has changed and it's worth retrying.
        self.tracker.reset_backoff(agent_slug)

        # Update wake tracking on the item
        try:
            api_patch(
                "agent_inbox_items",
                item_id,
                {
                    "last_wake_attempt_at": now_iso(),
                },
            )
        except Exception:
            pass

        # Enrich task assignments with blocker context
        enriched_summary = summary
        task_id = record.get("task_id")
        if event_type == "task_assignment" and task_id:
            try:
                blockers = api_get(
                    "task_relations",
                    {
                        "select": "target_task_id,tasks!task_relations_target_task_id_fkey(title,status)",
                        "source_task_id": f"eq.{task_id}",
                        "relation_type": "eq.blocked_by",
                    },
                )
                unresolved = [b for b in blockers if b.get("tasks", {}).get("status") not in ("done", "cancelled")]
                if unresolved:
                    blocker_names = [b.get("tasks", {}).get("title", "Unknown") for b in unresolved]
                    enriched_summary = (
                        f"{summary}\n\n"
                        f"Note: This task has {len(unresolved)} unresolved blocker(s): "
                        f"{', '.join(blocker_names)}. "
                        f"Consider working on unblocked tasks first or doing preparatory work."
                    )
            except Exception as e:
                log(f"Blocker enrichment failed for task {task_id}: {e}", level="warn")

        context = record.get("context")
        success = wake_agent(agent_slug, agent_id, f"New: {enriched_summary}", self.tracker, context=context)

        if success:
            try:
                api_patch(
                    "agent_inbox_items",
                    item_id,
                    {
                        "last_wake_success_at": now_iso(),
                    },
                )
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
            "Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and registry_config.py helper is not available",
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
    try:
        from sentry_init import init_sentry

        init_sentry("inbox_dispatcher")
    except ImportError:
        pass

    wait_for_supabase_config()

    log(f"Starting inbox dispatcher for gateway={GATEWAY_ID}")

    # Cache which agents are on this gateway.
    refresh_local_agents()
    log(f"Local agents on this gateway: {len(LOCAL_AGENT_IDS)}")

    tracker = WakeTracker(WAKE_COOLDOWN)

    # Run initial reconciliation to catch anything from before startup
    reconcile(tracker)

    # Start periodic reconciliation
    start_reconciliation_loop(tracker)

    # Start slot watcher (drains concurrency waitlist when processes finish)
    start_slot_watcher(tracker)

    # Start heartbeat file for Docker healthcheck
    start_heartbeat_file_loop()

    # Start Realtime listener
    dispatcher = InboxDispatcher(tracker)
    dispatcher.run()


if __name__ == "__main__":
    main()
