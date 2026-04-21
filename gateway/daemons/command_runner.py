#!/usr/bin/env python3
"""
Agent Command Runner

Daemon that watches the agent_commands table in Supabase via Realtime.
When a new command is inserted (from the HQ UI), it leases
the command, executes the appropriate shell command on the host, and
writes the results (stdout/stderr/exit code) back to Supabase.

This is the counterpart to the UI's agent lifecycle management.
The UI enqueues commands; this daemon processes them.

Environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  POLL_INTERVAL          — seconds between fallback polls (default: 30)
  COMMAND_TIMEOUT        — max seconds per command (default: 120)

Install:
  pip install websocket-client

Run:
  python3 /app/command_runner.py
"""

import json
import os
import re
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

# ── Config ─────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
COMMAND_TIMEOUT = int(os.environ.get("COMMAND_TIMEOUT", "120"))

HEARTBEAT_INTERVAL = 30
RECONNECT_DELAY = 5
MAX_RECONNECT_DELAY = 60

HOME = os.path.expanduser("~")


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

# Runtime mode — "systemd" (legacy VPS) or "docker" (Compose stack).
# Affects how restart_gateway / restart_dispatcher are dispatched.
RUNTIME_MODE = os.environ.get("RUNTIME_MODE", "systemd")
COMPOSE_PROJECT = os.environ.get("COMPOSE_PROJECT", "yourhq")

# This gateway's identity. Used to filter lease_command calls so multiple
# gateways running against the same Supabase don't steal each other's work.
GATEWAY_ID = os.environ.get("GATEWAY_ID", "default")
GATEWAY_LABEL = os.environ.get("GATEWAY_LABEL", GATEWAY_ID)

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


def api_rpc(fn_name, payload=None):
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/rpc/{fn_name}"
    data = json.dumps(payload or {}).encode()
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }, method="POST", data=data)
    with urllib.request.urlopen(req, timeout=15) as r:
        body = r.read().decode()
        return json.loads(body) if body.strip() else None


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


# ── Workspace slug (for resolving branch names) ───────────────────────

WORKSPACE_SLUG = None


def get_workspace_slug():
    global WORKSPACE_SLUG
    if WORKSPACE_SLUG is not None:
        return WORKSPACE_SLUG
    try:
        rows = api_get("workspace", {"select": "slug", "limit": "1"})
        if rows and rows[0].get("slug"):
            WORKSPACE_SLUG = rows[0]["slug"]
            log(f"Workspace slug: {WORKSPACE_SLUG}")
        else:
            WORKSPACE_SLUG = ""
    except Exception as e:
        log(f"Failed to fetch workspace slug: {e}")
        WORKSPACE_SLUG = ""
    return WORKSPACE_SLUG


def resolve_branch(agent_slug):
    """Resolve agent slug to git branch name (may include workspace prefix)."""
    ws = get_workspace_slug()
    return f"{ws}/{agent_slug}" if ws else agent_slug


# ── Slug validation ───────────────────────────────────────────────────

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PAIRING_CODE_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def validate_slug(slug):
    return bool(slug and SLUG_RE.match(slug) and len(slug) <= 40)


def validate_pairing_code(code):
    return bool(code and PAIRING_CODE_RE.match(code) and len(code) <= 100)


# ── Command execution ─────────────────────────────────────────────────


def build_command(action, agent_slug, payload):
    """Map an action to a shell command. Returns (args_list, description) or (None, error)."""

    if action == "provision":
        branch = resolve_branch(agent_slug)
        token = payload.get("telegram_token")
        if not token:
            return None, "Missing telegram_token in payload"
        if not validate_slug(agent_slug):
            return None, f"Invalid agent slug: {agent_slug}"
        # Phase 1: UI hands off init to the gateway. Payload carries the
        # wizard inputs so add-agent.sh can create the per-agent branch
        # locally off the template, patch agent.json, and fill USER.md.
        args = [f"{HOME}/add-agent.sh", branch, "--token", token]
        source_template = payload.get("source_template")
        if source_template:
            args += ["--source-branch", str(source_template)]
        args += ["--slug", agent_slug]
        for flag, key in [
            ("--name", "name"),
            ("--description", "description"),
            ("--emoji", "emoji"),
            ("--owner-name", "owner_name"),
            ("--owner-preferred-name", "owner_preferred_name"),
            ("--owner-timezone", "owner_timezone"),
        ]:
            val = payload.get(key)
            if val:
                args += [flag, str(val)]
        return args, f"Provisioning {agent_slug}"

    elif action == "approve_pairing":
        code = payload.get("pairing_code")
        if not code:
            return None, "Missing pairing_code in payload"
        code = str(code).strip()
        if not validate_pairing_code(code):
            return None, f"Invalid pairing code format"
        return ["openclaw", "pairing", "approve", "telegram", code], f"Approving pairing"

    elif action == "update":
        if not agent_slug:
            return None, "Missing agent slug for update"
        branch = resolve_branch(agent_slug)
        return [f"{HOME}/update-agent.sh", branch], f"Updating {agent_slug}"

    elif action == "remove":
        if not agent_slug:
            return None, "Missing agent slug for remove"
        branch = resolve_branch(agent_slug)
        return [f"{HOME}/remove-agent.sh", branch], f"Removing {agent_slug}"

    elif action == "restart_gateway":
        if RUNTIME_MODE == "docker":
            return ["docker", "compose", "-p", COMPOSE_PROJECT, "restart", "gateway"], "Restarting gateway (docker)"
        return ["openclaw", "gateway", "restart"], "Restarting gateway"

    elif action == "update_all":
        return [f"{HOME}/update-all-agents.sh"], "Updating all agents"

    elif action == "restart_dispatcher":
        if RUNTIME_MODE == "docker":
            return ["docker", "compose", "-p", COMPOSE_PROJECT, "restart", "dispatcher"], "Restarting dispatcher (docker)"
        return ["systemctl", "--user", "restart", "hq-inbox-dispatcher"], "Restarting dispatcher"

    else:
        return None, f"Unknown action: {action}"


def execute_command(command_row):
    """Execute a single command and report results back to Supabase."""
    cmd_id = command_row["id"]
    action = command_row["action"]
    agent_slug = command_row.get("agent_slug")
    payload = command_row.get("payload") or {}

    log(f"Processing command {cmd_id}: {action}" + (f" for {agent_slug}" if agent_slug else ""))

    # Mark as running
    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception as e:
        log(f"Failed to mark command as running: {e}")

    # Build the shell command
    args, description = build_command(action, agent_slug, payload)
    if args is None:
        # Validation error — fail immediately
        log(f"Command validation failed: {description}")
        try:
            api_rpc("fail_command", {
                "p_command_id": cmd_id,
                "p_exit_code": None,
                "p_stdout": None,
                "p_stderr": None,
                "p_error": description,
            })
        except Exception as e:
            log(f"Failed to report failure: {e}")
        return

    log(f"Running: {' '.join(args[:3])}...")

    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=COMMAND_TIMEOUT,
            env={**os.environ, "HOME": HOME},
        )

        stdout = result.stdout[-10000:] if result.stdout else None  # Cap at 10KB
        stderr = result.stderr[-10000:] if result.stderr else None

        if result.returncode == 0:
            log(f"Command {cmd_id} completed successfully (exit 0)")
            api_rpc("complete_command", {
                "p_command_id": cmd_id,
                "p_exit_code": 0,
                "p_stdout": stdout,
                "p_stderr": stderr,
            })

            # Scrub telegram token from payload after successful provisioning
            if action == "provision" and "telegram_token" in payload:
                try:
                    scrubbed = {k: v for k, v in payload.items() if k != "telegram_token"}
                    scrubbed["telegram_token_scrubbed"] = True
                    api_patch("agent_commands", cmd_id, {"payload": scrubbed})
                except Exception:
                    pass
        else:
            log(f"Command {cmd_id} failed (exit {result.returncode})")
            api_rpc("fail_command", {
                "p_command_id": cmd_id,
                "p_exit_code": result.returncode,
                "p_stdout": stdout,
                "p_stderr": stderr,
                "p_error": f"Exited with code {result.returncode}",
            })

    except subprocess.TimeoutExpired:
        log(f"Command {cmd_id} timed out after {COMMAND_TIMEOUT}s")
        api_rpc("fail_command", {
            "p_command_id": cmd_id,
            "p_exit_code": None,
            "p_stdout": None,
            "p_stderr": None,
            "p_error": f"Timed out after {COMMAND_TIMEOUT} seconds",
        })

    except Exception as e:
        log(f"Command {cmd_id} execution error: {e}")
        try:
            api_rpc("fail_command", {
                "p_command_id": cmd_id,
                "p_exit_code": None,
                "p_stdout": None,
                "p_stderr": None,
                "p_error": str(e),
            })
        except Exception:
            pass


# ── Command processing loop ───────────────────────────────────────────


def process_pending():
    """Lease and execute pending commands until none remain."""
    processed = 0
    while True:
        try:
            rows = api_rpc("lease_command", {
                "p_lease_seconds": COMMAND_TIMEOUT + 60,
                "p_gateway_slug": GATEWAY_ID,
            })
            if not rows:
                break
            # lease_command returns SETOF, so it's a list
            if isinstance(rows, list) and len(rows) > 0:
                execute_command(rows[0])
                processed += 1
            else:
                break
        except Exception as e:
            log(f"Error leasing command: {e}")
            break
    return processed


# ── Polling fallback ──────────────────────────────────────────────────


def start_poll_loop():
    def loop():
        while True:
            time.sleep(POLL_INTERVAL)
            try:
                count = process_pending()
                if count > 0:
                    log(f"Poll: processed {count} command(s)")
            except Exception as e:
                log(f"Poll error: {e}")
    t = threading.Thread(target=loop, daemon=True)
    t.start()
    log(f"Fallback poll started (every {POLL_INTERVAL}s)")


# ── Realtime listener ─────────────────────────────────────────────────


class CommandListener:
    def __init__(self):
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

        self._send("realtime:public:agent_commands", "phx_join", {
            "config": {"postgres_changes": [{
                "event": "INSERT",
                "schema": "public",
                "table": "agent_commands",
            }]}
        })

        self._start_heartbeat()
        log("Listening for agent_commands inserts")

    def _on_message(self, ws, raw):
        try:
            msg = json.loads(raw)
        except Exception:
            return

        if msg.get("event") == "postgres_changes":
            data = msg.get("payload", {}).get("data", {})
            if data.get("table") == "agent_commands" and data.get("type") == "INSERT":
                record = data.get("record", {})
                action = record.get("action", "?")
                agent_slug = record.get("agent_slug", "")
                log(f"New command: {action}" + (f" for {agent_slug}" if agent_slug else ""))
                # Process all pending (not just this one — catches any missed)
                count = process_pending()
                if count > 0:
                    log(f"Realtime: processed {count} command(s)")

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


# ── Gateway heartbeat ──────────────────────────────────────────────────


def heartbeat_once():
    """Upsert this gateway's row in the gateways table so the UI sees us online."""
    try:
        api_post_upsert("gateways", {
            "slug": GATEWAY_ID,
            "label": GATEWAY_LABEL,
            "status": "online",
            "last_seen_at": now_iso(),
        }, on_conflict="slug")
    except Exception as e:
        log(f"heartbeat failed: {e}")


def start_heartbeat_loop():
    def loop():
        while True:
            heartbeat_once()
            time.sleep(30)
    t = threading.Thread(target=loop, daemon=True)
    t.start()


def api_post_upsert(table, body, on_conflict):
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?on_conflict={on_conflict}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


# ── Main ───────────────────────────────────────────────────────────────


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)

    log(f"Starting command runner for gateway={GATEWAY_ID} ({GATEWAY_LABEL})")

    # Register + heartbeat so the UI can see this gateway
    heartbeat_once()
    start_heartbeat_loop()

    # Pre-fetch workspace slug
    get_workspace_slug()

    # Process any commands queued before we started
    count = process_pending()
    if count > 0:
        log(f"Startup: processed {count} pending command(s)")

    # Start fallback polling
    start_poll_loop()

    # Start Realtime listener (blocks)
    listener = CommandListener()
    listener.run()


if __name__ == "__main__":
    main()
