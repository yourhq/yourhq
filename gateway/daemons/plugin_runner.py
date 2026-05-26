#!/usr/bin/env python3
"""
HQ Plugin Runner

Daemon that watches hq_plugin_event_queue for events emitted by SQL triggers
and dispatches them to enabled plugins (local Python handlers or remote
webhook endpoints).

Also subscribes to hq_plugins for config changes (enable/disable/update).

Environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  POLL_INTERVAL   — seconds between event queue polls (default: 5)
  GATEWAY_ID      — this gateway's identifier (default: "default")
  TENANT_ID       — tenant scope (default: single-tenant UUID)
  PLUGINS_DIR     — path to local plugins directory (default: /app/plugins)

Install:
  pip install websocket-client requests

Run:
  python3 /app/plugin_runner.py
"""

from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import logging
import os
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

try:
    import websocket
except ImportError:
    print("Missing: pip install websocket-client", file=sys.stderr)
    sys.exit(1)

try:
    import requests as http_requests
except ImportError:
    http_requests = None  # type: ignore[assignment]

try:
    from registry_config import resolve as resolve_hq_config
except ImportError:
    resolve_hq_config = None  # type: ignore[assignment]

# ── Config ────────────────────────────────────────────────────────────

SUPABASE_URL = ""
SUPABASE_KEY = ""
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))
GATEWAY_ID = os.environ.get("GATEWAY_ID", "default")
DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000000"
TENANT_ID = os.environ.get("TENANT_ID", DEFAULT_TENANT_ID)
PLUGINS_DIR = Path(os.environ.get("PLUGINS_DIR", "/app/plugins"))

HEARTBEAT_INTERVAL = 30
RECONNECT_DELAY = 5
MAX_RECONNECT_DELAY = 60

# ── Logging ───────────────────────────────────────────────────────────


def log(msg, level="info", **extra):
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "level": level,
        "daemon": "plugin_runner",
        "gateway_id": GATEWAY_ID,
        "tenant_id": TENANT_ID,
        "msg": msg,
    }
    if extra:
        entry.update(extra)
    print(json.dumps(entry, default=str), flush=True)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ── Supabase helpers ──────────────────────────────────────────────────


def api_get(table, params):
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?{urllib.parse.urlencode(params)}"
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


def api_post(table, body):
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    urllib.request.urlopen(req, timeout=15)


def api_patch(table, filters, payload):
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?{urllib.parse.urlencode(filters)}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="PATCH",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    urllib.request.urlopen(req, timeout=15)


# ── Plugin registry (in-memory) ──────────────────────────────────────

# plugin_id → handler dict
PLUGINS: dict[str, dict] = {}


def load_plugins():
    """Fetch enabled plugins from hq_plugins and instantiate handlers."""
    global PLUGINS
    try:
        rows = api_get(
            "hq_plugins",
            {
                "is_enabled": "eq.true",
                "select": "plugin_id,name,source,hooks,entry_module,webhook_url,webhook_secret,config,capabilities",
            },
        )
    except Exception as e:
        log(f"Failed to load plugins: {e}", level="error")
        return

    new_plugins: dict[str, dict] = {}
    for row in rows:
        pid = row["plugin_id"]
        source = row["source"]

        if source in ("local", "builtin", "marketplace"):
            handler = load_local_plugin(row)
            if handler:
                new_plugins[pid] = {
                    "type": "local",
                    "handler": handler,
                    "hooks": set(row.get("hooks") or []),
                    "name": row["name"],
                }
        elif source == "webhook":
            new_plugins[pid] = {
                "type": "webhook",
                "url": row.get("webhook_url"),
                "secret": row.get("webhook_secret"),
                "hooks": set(row.get("hooks") or []),
                "name": row["name"],
            }

    # Shut down removed/disabled plugins
    for pid, entry in PLUGINS.items():
        if pid not in new_plugins and entry["type"] == "local":
            try:
                entry["handler"].on_shutdown()
            except Exception:
                pass

    PLUGINS = new_plugins
    log(f"Loaded {len(PLUGINS)} plugin(s): {', '.join(PLUGINS.keys()) or '(none)'}")


def load_local_plugin(row: dict):
    """Import a local plugin's handler.py and instantiate it."""
    from gateway.plugins.sdk import (
        BasePlugin,
        PluginContext,
        SecretsClient,
        StateClient,
        SupabaseClient,
    )

    pid = row["plugin_id"]
    module_name = row.get("entry_module") or pid
    module_path = PLUGINS_DIR / module_name / "handler.py"

    if not module_path.exists():
        log(f"Plugin {pid}: handler.py not found at {module_path}", level="warn")
        return None

    try:
        spec = importlib.util.spec_from_file_location(f"hq_plugin_{module_name}", module_path)
        if spec is None or spec.loader is None:
            log(f"Plugin {pid}: could not create module spec", level="warn")
            return None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    except Exception as e:
        log(f"Plugin {pid}: failed to import handler: {e}", level="error")
        return None

    handler_class = getattr(mod, "Handler", None)
    if handler_class is None or not (isinstance(handler_class, type) and issubclass(handler_class, BasePlugin)):
        log(f"Plugin {pid}: handler.py must export a Handler(BasePlugin) class", level="warn")
        return None

    ctx = PluginContext(
        config=row.get("config") or {},
        state=StateClient(pid, TENANT_ID, SUPABASE_URL, SUPABASE_KEY),
        secrets=SecretsClient(TENANT_ID, GATEWAY_ID),
        supabase=SupabaseClient(SUPABASE_URL, SUPABASE_KEY, TENANT_ID),
        logger=logging.getLogger(f"hq.plugin.{pid}"),
    )

    try:
        return handler_class(ctx)
    except Exception as e:
        log(f"Plugin {pid}: failed to instantiate handler: {e}", level="error")
        return None


# ── Event dispatch ────────────────────────────────────────────────────


def dispatch_event(event_type: str, entity_type: str | None, entity_id: str | None, payload: dict):
    """Dispatch an event to all plugins subscribed to this hook."""
    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id=str(uuid4()),
        event_type=event_type,
        occurred_at=now_iso(),
        tenant_id=TENANT_ID,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload,
    )

    for pid, entry in PLUGINS.items():
        if event_type not in entry["hooks"]:
            continue

        start = time.monotonic()
        try:
            if entry["type"] == "local":
                result = entry["handler"].on_event(event)
                duration_ms = int((time.monotonic() - start) * 1000)
                log_msg = result.log_message if result else None
                record_plugin_event(pid, event, "success", duration_ms, log_message=log_msg)
            elif entry["type"] == "webhook":
                dispatch_webhook(pid, entry, event)
                duration_ms = int((time.monotonic() - start) * 1000)
                record_plugin_event(pid, event, "success", duration_ms)
        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            log(f"Plugin {pid} error on {event_type}: {e}", level="error")
            record_plugin_event(pid, event, "error", duration_ms, error_message=str(e))


def dispatch_webhook(pid: str, entry: dict, event):
    """POST the event to the webhook URL with HMAC signature."""
    url = entry.get("url")
    if not url:
        raise ValueError("No webhook URL configured")
    if not url.startswith("https://"):
        raise ValueError(f"Webhook URL must use HTTPS: {url}")

    payload_str = json.dumps(event.to_dict())

    headers = {
        "Content-Type": "application/json",
        "X-HQ-Event": event.event_type,
        "X-HQ-Plugin-Id": pid,
        "X-HQ-Delivery": event.event_id,
    }

    secret = entry.get("secret")
    if secret:
        sig = hmac.new(secret.encode(), payload_str.encode(), hashlib.sha256).hexdigest()
        headers["X-HQ-Signature"] = f"sha256={sig}"

    if http_requests:
        resp = http_requests.post(url, data=payload_str, headers=headers, timeout=10)
        resp.raise_for_status()
    else:
        req = urllib.request.Request(url, data=payload_str.encode(), headers=headers, method="POST")
        urllib.request.urlopen(req, timeout=10)


def record_plugin_event(
    plugin_id: str,
    event,
    status: str,
    duration_ms: int | None = None,
    error_message: str | None = None,
    log_message: str | None = None,
):
    """Write a row to hq_plugin_events for observability."""
    try:
        body = {
            "tenant_id": TENANT_ID,
            "plugin_id": plugin_id,
            "hook": event.event_type,
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "status": status,
            "duration_ms": duration_ms,
            "error_message": (error_message or log_message or "")[:1000] or None,
        }
        api_post("hq_plugin_events", body)
    except Exception as e:
        log(f"Failed to record plugin event: {e}", level="warn")


# ── Event queue processing ────────────────────────────────────────────


def process_event_queue():
    """Fetch unprocessed events from hq_plugin_event_queue, dispatch, mark processed."""
    try:
        rows = api_get(
            "hq_plugin_event_queue",
            {
                "processed": "eq.false",
                "order": "created_at.asc",
                "limit": "100",
            },
        )
    except Exception as e:
        log(f"Failed to poll event queue: {e}", level="error")
        return 0

    if not rows:
        return 0

    count = 0
    for row in rows:
        event_type = row.get("event_type", "")
        entity_type = row.get("entity_type")
        entity_id = row.get("entity_id")
        payload = row.get("payload") or {}
        row_id = row.get("id")

        dispatch_event(event_type, entity_type, entity_id, payload)

        try:
            api_patch("hq_plugin_event_queue", {"id": f"eq.{row_id}"}, {"processed": True})
        except Exception as e:
            log(f"Failed to mark event {row_id} as processed: {e}", level="warn")

        count += 1

    return count


# ── Polling loop ──────────────────────────────────────────────────────


def start_poll_loop():
    def poll():
        while True:
            time.sleep(POLL_INTERVAL)
            try:
                count = process_event_queue()
                if count > 0:
                    log(f"Poll: processed {count} event(s)")
            except Exception as e:
                log(f"Poll error: {e}", level="error")

    t = threading.Thread(target=poll, daemon=True)
    t.start()


# ── Realtime listener ─────────────────────────────────────────────────


class PluginListener:
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

        self._send(
            "realtime:public:hq_plugin_event_queue",
            "phx_join",
            {
                "config": {
                    "postgres_changes": [
                        {
                            "event": "INSERT",
                            "schema": "public",
                            "table": "hq_plugin_event_queue",
                        }
                    ]
                }
            },
        )

        self._send(
            "realtime:public:hq_plugins",
            "phx_join",
            {
                "config": {
                    "postgres_changes": [
                        {
                            "event": "*",
                            "schema": "public",
                            "table": "hq_plugins",
                        }
                    ]
                }
            },
        )

        self._start_heartbeat()
        log("Listening for plugin events + plugin config changes")

    def _on_message(self, ws, raw):
        try:
            msg = json.loads(raw)
        except Exception:
            return

        if msg.get("event") == "postgres_changes":
            data = msg.get("payload", {}).get("data", {})
            table = data.get("table")

            if table == "hq_plugin_event_queue" and data.get("type") == "INSERT":
                count = process_event_queue()
                if count > 0:
                    log(f"Realtime: processed {count} event(s)")

            elif table == "hq_plugins":
                log("Plugin config changed — reloading plugins")
                load_plugins()

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


# ── Main ──────────────────────────────────────────────────────────────


def wait_for_supabase_config():
    global SUPABASE_URL, SUPABASE_KEY

    env_url = os.environ.get("SUPABASE_URL", "").strip()
    env_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if env_url and env_key:
        SUPABASE_URL = env_url
        SUPABASE_KEY = env_key
        return

    if resolve_hq_config is None:
        print(
            "Missing: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and registry_config.py is not available",
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
            log(f"  still waiting for onboarding ({waited}s)")
        time.sleep(5)
        waited += 5


def main():
    try:
        from sentry_init import init_sentry

        init_sentry("plugin_runner")
    except ImportError:
        pass

    wait_for_supabase_config()

    log(f"Starting plugin runner for gateway={GATEWAY_ID}")

    load_plugins()

    count = process_event_queue()
    if count > 0:
        log(f"Startup: processed {count} pending event(s)")

    start_poll_loop()

    listener = PluginListener()
    listener.run()


if __name__ == "__main__":
    main()
