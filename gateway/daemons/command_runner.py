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

try:
    from git_backup_sweep import start_backup_sweep
except ImportError:
    # Running standalone; sweep disabled.
    def start_backup_sweep() -> None:  # type: ignore[misc]
        pass

try:
    from registry_config import resolve as resolve_hq_config
except ImportError:
    resolve_hq_config = None  # type: ignore[assignment]

# ── Config ─────────────────────────────────────────────────────────────
# Populated at main() startup from env OR the project registry fallback.
# Kept as module-level globals so existing call sites don't need to change.

SUPABASE_URL = ""
SUPABASE_KEY = ""
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

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000000"
TENANT_ID = os.environ.get("TENANT_ID", DEFAULT_TENANT_ID)

# Where the user's browser sits relative to this gateway. "local" = same
# machine, so openclaw's native http://localhost:1455 callback can
# auto-complete OAuth without a paste step. Anything else (tailscale,
# public, codespace) means the browser is somewhere else and we have to
# fall through to paste mode by holding port 1455 ourselves.
NETWORKING_MODE = os.environ.get("NETWORKING_MODE", "local").strip().lower()

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


def log(msg, level="info", **extra):
    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "level": level,
        "daemon": "command_runner",
        "gateway_id": GATEWAY_ID if GATEWAY_ID else "unknown",
        "tenant_id": TENANT_ID,
        "msg": msg,
    }
    if extra:
        entry.update(extra)
    print(json.dumps(entry, default=str), flush=True)


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
    """Map an action to a shell command. Returns (args_list, description) or (None, error).

    Connection actions (auth_*) are handled separately in execute_command — they don't
    fit the "run shell command, capture stdout, exit" mold because OAuth flows need
    interactive stdin and intermediate progress updates.
    """

    if action == "provision":
        branch = resolve_branch(agent_slug)
        if not validate_slug(agent_slug):
            return None, f"Invalid agent slug: {agent_slug}"
        channel = payload.get("channel", "telegram")
        args = [f"{HOME}/add-agent.sh", branch, "--channel", channel]
        if channel == "telegram":
            token = payload.get("telegram_token")
            if not token:
                return None, "Missing telegram_token in payload for telegram channel"
            args += ["--telegram-token", token]
        elif channel == "discord":
            token = payload.get("discord_token")
            if not token:
                return None, "Missing discord_token in payload for discord channel"
            args += ["--discord-token", token]
            if payload.get("discord_server_id"):
                args += ["--discord-server-id", str(payload["discord_server_id"])]
            if payload.get("discord_user_id"):
                args += ["--discord-user-id", str(payload["discord_user_id"])]
        elif channel == "slack":
            if not payload.get("slack_app_token") or not payload.get("slack_bot_token"):
                return None, "Missing slack_app_token or slack_bot_token in payload for slack channel"
            args += ["--slack-app-token", str(payload["slack_app_token"]),
                     "--slack-bot-token", str(payload["slack_bot_token"])]
        # none: no credential args
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
        channel = payload.get("channel", "telegram")
        return ["openclaw", "pairing", "approve", channel, code], f"Approving pairing"

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

    elif action == "update_gateway":
        if RUNTIME_MODE == "docker":
            return ["bash", "-c", f"docker compose -p {COMPOSE_PROJECT} pull && docker compose -p {COMPOSE_PROJECT} up -d"], "Updating gateway (docker pull + up)"
        return ["bash", "-c", "cd ~ && git pull && ./install.sh --update"], "Updating gateway (git pull)"

    else:
        return None, f"Unknown action: {action}"


# ── Connection actions (provider auth from the UI) ────────────────────
#
# Background: openclaw's `models auth login` is interactive. For OAuth
# providers it prints a URL and waits for the user to paste back a
# redirect URL or code. For device-code flows it prints a URL + short
# code and polls until the user authorizes. Neither shape works under
# subprocess.run() because that expects a one-shot exit.
#
# Approach: spawn the CLI as a long-running Popen, watch its stdout in a
# background thread, parse URL/code patterns, write progress into
# agent_commands.payload.connection_state. When the UI gets a paste-back
# from the user it inserts an auth_paste row that references the parent
# command_id; we look up the parent's Popen and write to its stdin.
#
# Process registry is in-memory only. Runner restart abandons in-flight
# auth flows — user has to retry. Acceptable; flows are <5 min and the
# runner restarts rarely outside of explicit "restart gateway" commands.

INFLIGHT_AUTH = {}  # parent_command_id -> dict(proc, started_at, provider, profile_name)
INFLIGHT_LOCK = threading.Lock()
AUTH_FLOW_TIMEOUT = 300  # 5 min ceiling per flow


def patch_command_payload(cmd_id, patch):
    """Merge `patch` into agent_commands.payload — preserving existing keys."""
    try:
        rows = api_get("agent_commands", {
            "select": "payload",
            "id": f"eq.{cmd_id}",
            "limit": "1",
        })
        existing = (rows[0].get("payload") if rows else {}) or {}
        merged = {**existing, **patch}
        api_patch("agent_commands", cmd_id, {"payload": merged})
    except Exception as e:
        log(f"Failed to patch payload for {cmd_id}: {e}")


def occupy_localhost_1455():
    """Pre-bind 127.0.0.1:1455 so openclaw's PKCE callback fails fast.

    Why: in container mode openclaw still tries the localhost callback
    first. If it succeeds, the user's browser can't reach it and the
    flow hangs. By holding the port we force the CLI's paste-fallback
    path, which is the only thing that works for browser-driven UX.
    Returned socket must be closed by caller after the flow finishes.
    """
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", 1455))
        s.listen(1)
        return s
    except OSError:
        # Port already taken — that's fine, openclaw will fall through
        # to paste mode on its own. Close the socket we never used.
        s.close()
        return None


URL_PATTERNS = [
    re.compile(r"https?://[^\s\"'<>]+"),
]
CODE_PATTERNS = [
    # GitHub/Codex device-code prints things like "code: ABCD-1234" or
    # "Enter code: XXXX". Capture short alphanumerics.
    re.compile(r"code[: ]+([A-Z0-9-]{4,12})", re.IGNORECASE),
    re.compile(r"verification[_ ]code[: ]+([A-Z0-9-]{4,12})", re.IGNORECASE),
]

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|[\x00-\x08\x0b\x0c\x0e-\x1f]")


def strip_ansi(s):
    """Drop ANSI escape sequences + control bytes that clack-style CLIs emit.

    openclaw uses the @clack/prompts library which paints UI with cursor
    moves and spinner frames. Without stripping, our regex matches the
    URL but the surrounding line has 30+ control bytes that break copy.
    """
    return ANSI_RE.sub("", s)


LOCALHOST_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?(/|$)", re.IGNORECASE)


def parse_auth_progress(text):
    """Pull URL + verification code out of CLI stdout. Returns (url, code) or (None, None)."""
    cleaned = strip_ansi(text)
    url = None
    code = None
    for line in cleaned.splitlines():
        if not url:
            m = URL_PATTERNS[0].search(line)
            if m:
                candidate = m.group(0).rstrip(".,;:")
                if not LOCALHOST_RE.match(candidate):
                    url = candidate
        if not code:
            for p in CODE_PATTERNS:
                cm = p.search(line)
                if cm:
                    code = cm.group(1)
                    break
    return url, code


def watch_auth_stdout(cmd_id, master_fd, on_url_ready, stop_event, output_sink):
    """Background thread: read PTY master, scan for URL/code, fire callback.

    Reads bytes off the master fd (the parent end of the PTY) and appends
    to `output_sink` (a list) so the main handler can pull final output
    when the process exits. `stop_event` signals shutdown.
    """
    import select
    buf = b""
    found = False
    while not stop_event.is_set():
        try:
            r, _, _ = select.select([master_fd], [], [], 0.5)
        except (OSError, ValueError):
            break
        if master_fd not in r:
            continue
        try:
            chunk = os.read(master_fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
        output_sink.append(chunk)
        if not found:
            try:
                text = buf.decode("utf-8", errors="replace")
            except Exception:
                text = ""
            url, code = parse_auth_progress(text)
            if url:
                found = True
                try:
                    on_url_ready(url, code)
                except Exception as e:
                    log(f"on_url_ready failed: {e}")
        # Cap buffer growth — only need the recent few KB.
        if len(buf) > 32 * 1024:
            buf = buf[-8 * 1024:]
    log(f"auth stdout stream closed for {cmd_id}")


def cleanup_auth_flow(cmd_id, sock=None):
    with INFLIGHT_LOCK:
        entry = INFLIGHT_AUTH.pop(cmd_id, None)
    if entry:
        # Signal the watcher thread first so it stops blocking on select().
        stop_event = entry.get("stop_event")
        if stop_event:
            try:
                stop_event.set()
            except Exception:
                pass
        try:
            entry["proc"].terminate()
        except Exception:
            pass
        # Close the PTY master fd we opened.
        master_fd = entry.get("master_fd")
        if master_fd is not None:
            try:
                os.close(master_fd)
            except Exception:
                pass
    if sock:
        try:
            sock.close()
        except Exception:
            pass


def handle_auth_set_api_key(cmd_id, payload):
    """Single-shot path for api_key shape — no interactivity required.

    payload: { provider: str, api_key: str, profile_name?: str }
    """
    provider = (payload.get("provider") or "").strip()
    api_key = payload.get("api_key") or ""
    profile_name = (payload.get("profile_name") or "default").strip() or "default"

    if not provider or not api_key:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": "Missing provider or api_key",
        })
        return

    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception:
        pass

    # paste-token writes the key into the auth store as <provider>:<profile_name>.
    args = [
        "openclaw", "models", "auth", "paste-token",
        "--provider", provider,
        "--profile-id", profile_name,
    ]
    try:
        result = subprocess.run(
            args, input=api_key + "\n",
            capture_output=True, text=True,
            timeout=30,
            env={**os.environ, "HOME": HOME},
        )
        # If the caller supplied a base_url (local_url providers like
        # Ollama), write it into the auth store so openclaw connects to
        # the right endpoint. We edit auth-profiles.json directly — same
        # pattern handle_auth_remove uses.
        base_url = (payload.get("base_url") or "").strip()
        if base_url and result.returncode == 0:
            state_dir = os.environ.get("OPENCLAW_STATE_DIR", os.path.join(HOME, ".openclaw"))
            import glob as _glob
            for path in _glob.glob(os.path.join(state_dir, "agents", "*", "agent", "auth-profiles.json")):
                real = os.path.realpath(path)
                try:
                    with open(real, "r") as f:
                        doc = json.load(f)
                    pid = f"{provider}:{profile_name}"
                    profiles = doc.get("profiles", {})
                    if pid in profiles:
                        profiles[pid]["baseUrl"] = base_url
                        tmp = real + ".tmp"
                        with open(tmp, "w") as f:
                            json.dump(doc, f, indent=2)
                        os.replace(tmp, real)
                        log(f"Set baseUrl={base_url} for {pid} in {real}")
                except Exception as e:
                    log(f"Failed to set baseUrl in {real}: {e}")

        if result.returncode == 0:
            sync_to_shared_auth()

        # Scrub the API key from the row immediately on completion.
        scrubbed = {k: v for k, v in payload.items() if k not in ("api_key", "base_url")}
        scrubbed["api_key_scrubbed"] = True
        if base_url:
            scrubbed["base_url_applied"] = True
        try:
            api_patch("agent_commands", cmd_id, {"payload": scrubbed})
        except Exception:
            pass
        if result.returncode == 0:
            api_rpc("complete_command", {
                "p_command_id": cmd_id, "p_exit_code": 0,
                "p_stdout": (result.stdout or "")[-2000:],
                "p_stderr": (result.stderr or "")[-2000:],
            })
        else:
            api_rpc("fail_command", {
                "p_command_id": cmd_id, "p_exit_code": result.returncode,
                "p_stdout": (result.stdout or "")[-2000:],
                "p_stderr": (result.stderr or "")[-2000:],
                "p_error": f"openclaw exit {result.returncode}",
            })
    except subprocess.TimeoutExpired:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": "openclaw paste-token timed out",
        })
    except Exception as e:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None, "p_error": str(e),
        })


def handle_auth_start(cmd_id, payload):
    """Long-running interactive auth login.

    payload: { provider: str, profile_name?: str, mode?: 'oauth_paste' | 'device_code' }
    """
    provider = (payload.get("provider") or "").strip()
    profile_name = (payload.get("profile_name") or "default").strip() or "default"
    mode = payload.get("mode") or "oauth_paste"

    if not provider:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None, "p_error": "Missing provider",
        })
        return

    # Mark as running first so the UI can subscribe.
    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception:
        pass

    # Mark UI: starting.
    patch_command_payload(cmd_id, {"connection_state": {"stage": "starting"}})

    args = ["openclaw", "models", "auth", "login", "--provider", provider]
    if mode == "device_code":
        args.append("--device-code")
    if profile_name and profile_name != "default":
        args += ["--profile-id", profile_name]

    # Decide whether we let openclaw's localhost:1455 listener handle
    # the callback natively, or pre-occupy 1455 to force paste mode.
    #
    # `auto_callback` = True means openclaw catches the redirect itself.
    # It works only when the browser and the gateway are on the same
    # machine — i.e. NETWORKING_MODE=local AND oauth_paste shape.
    # Device-code flows never use 1455.
    auto_callback = (
        mode == "oauth_paste" and NETWORKING_MODE == "local"
    )
    sock = None
    if mode == "oauth_paste" and not auto_callback:
        sock = occupy_localhost_1455()

    # PTY-backed spawn. openclaw uses @clack/prompts which calls
    # process.stdin.isTTY — without a real tty it bails immediately
    # (exit 1, "Open: <url>" printed, then the spinner never renders).
    # We allocate a pseudo-terminal pair: child gets `slave` as its
    # stdin/stdout/stderr, we keep `master` to read output and write
    # the user's pasted code in.
    import pty
    master_fd, slave_fd = pty.openpty()
    output_sink = []
    stop_event = threading.Event()

    try:
        proc = subprocess.Popen(
            args,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            env={**os.environ, "HOME": HOME, "TERM": "xterm-256color"},
            preexec_fn=os.setsid,  # Detach from runner's controlling tty.
        )
    except Exception as e:
        try:
            os.close(master_fd)
        except Exception:
            pass
        try:
            os.close(slave_fd)
        except Exception:
            pass
        cleanup_auth_flow(cmd_id, sock)
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": f"Failed to spawn openclaw: {e}",
        })
        return

    # The child has its own copy of slave_fd via dup2 — close ours.
    try:
        os.close(slave_fd)
    except Exception:
        pass

    started_at = time.time()
    with INFLIGHT_LOCK:
        INFLIGHT_AUTH[cmd_id] = {
            "proc": proc,
            "master_fd": master_fd,
            "stop_event": stop_event,
            "started_at": started_at,
            "provider": provider,
            "profile_name": profile_name,
            "sock": sock,
        }

    def on_url_ready(url, code):
        stage = "polling" if mode == "device_code" else "url_ready"
        state = {"stage": stage, "url": url}
        if code:
            state["verificationCode"] = code
        # In local mode openclaw's own listener catches the redirect, so
        # the UI should show "waiting for sign-in" and not the paste-back
        # input. Tell it.
        if auto_callback:
            state["autoCallback"] = True
        patch_command_payload(cmd_id, {"connection_state": state})

    threading.Thread(
        target=watch_auth_stdout,
        args=(cmd_id, master_fd, on_url_ready, stop_event, output_sink),
        daemon=True,
    ).start()

    # For device_code we wait for the CLI to exit on its own (it polls
    # until the user authorizes). For oauth_paste we wait for either
    # exit or auth_paste callback — both are detected here by polling
    # the process's returncode under timeout.
    deadline = started_at + AUTH_FLOW_TIMEOUT
    while time.time() < deadline:
        rc = proc.poll()
        if rc is not None:
            break
        time.sleep(1)

    rc = proc.returncode
    # Stop the watcher and drain remaining bytes.
    stop_event.set()
    time.sleep(0.2)  # let watcher exit so we don't double-read
    try:
        # Drain anything still buffered. Non-blocking read.
        import fcntl
        fcntl.fcntl(master_fd, fcntl.F_SETFL, os.O_NONBLOCK)
        while True:
            try:
                chunk = os.read(master_fd, 4096)
            except (BlockingIOError, OSError):
                break
            if not chunk:
                break
            output_sink.append(chunk)
    except Exception:
        pass

    remaining_bytes = b"".join(output_sink)
    try:
        remaining = strip_ansi(remaining_bytes.decode("utf-8", errors="replace"))
    except Exception:
        remaining = ""

    cleanup_auth_flow(cmd_id, sock)

    if rc is None:
        # Timed out — kill it.
        try:
            proc.kill()
        except Exception:
            pass
        patch_command_payload(cmd_id, {
            "connection_state": {"stage": "failed", "error": "timed out"},
        })
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": (remaining or "")[-2000:], "p_stderr": None,
            "p_error": f"Auth flow timed out after {AUTH_FLOW_TIMEOUT}s",
        })
        return

    if rc == 0:
        profile_id = f"{provider}:{profile_name}"
        sync_to_shared_auth()
        patch_command_payload(cmd_id, {
            "connection_state": {"stage": "completed", "profileId": profile_id},
        })
        api_rpc("complete_command", {
            "p_command_id": cmd_id, "p_exit_code": 0,
            "p_stdout": (remaining or "")[-2000:], "p_stderr": None,
        })
    else:
        patch_command_payload(cmd_id, {
            "connection_state": {"stage": "failed", "error": f"openclaw exit {rc}"},
        })
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": rc,
            "p_stdout": (remaining or "")[-2000:], "p_stderr": None,
            "p_error": f"openclaw exit {rc}",
        })


def handle_auth_paste(cmd_id, payload):
    """User pasted the OAuth code/redirect-URL back. Write it to the parent
    process's stdin and complete this row.

    payload: { parent_command_id: str, value: str }
    """
    parent_id = payload.get("parent_command_id")
    value = payload.get("value") or ""

    if not parent_id or not value:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": "Missing parent_command_id or value",
        })
        return

    with INFLIGHT_LOCK:
        entry = INFLIGHT_AUTH.get(parent_id)

    if not entry:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": "No in-flight auth flow with that parent id (may have timed out)",
        })
        return

    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception:
        pass

    master_fd = entry.get("master_fd")
    try:
        if master_fd is None:
            raise RuntimeError("parent flow has no master fd")
        # Write to the PTY master so the child sees it on its stdin.
        # Newline submits the prompt for line-mode prompts (clack uses
        # this for text fields). Some prompts may need \r instead — we
        # send both to be safe.
        os.write(master_fd, (value + "\r\n").encode("utf-8"))
        # Scrub the pasted secret immediately.
        scrubbed = {k: v for k, v in payload.items() if k != "value"}
        scrubbed["value_scrubbed"] = True
        try:
            api_patch("agent_commands", cmd_id, {"payload": scrubbed})
        except Exception:
            pass
        api_rpc("complete_command", {
            "p_command_id": cmd_id, "p_exit_code": 0,
            "p_stdout": "Pasted to parent flow.", "p_stderr": None,
        })
    except Exception as e:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": f"Failed to write to parent stdin: {e}",
        })


def handle_auth_list(cmd_id, payload):
    """Probe all configured profiles, return JSON for the UI to consume."""
    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception:
        pass

    args = ["openclaw", "models", "status", "--json", "--probe"]
    try:
        result = subprocess.run(
            args, capture_output=True, text=True,
            timeout=60,
            env={**os.environ, "HOME": HOME},
        )
        if result.returncode != 0:
            api_rpc("fail_command", {
                "p_command_id": cmd_id, "p_exit_code": result.returncode,
                "p_stdout": (result.stdout or "")[-4000:],
                "p_stderr": (result.stderr or "")[-2000:],
                "p_error": f"openclaw exit {result.returncode}",
            })
            return
        # The UI consumes stdout as the connections list.
        api_rpc("complete_command", {
            "p_command_id": cmd_id, "p_exit_code": 0,
            "p_stdout": (result.stdout or "")[-32000:],
            "p_stderr": (result.stderr or "")[-2000:],
        })
    except subprocess.TimeoutExpired:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": "openclaw status timed out",
        })
    except Exception as e:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None, "p_error": str(e),
        })


def handle_auth_remove(cmd_id, payload):
    """Remove a profile from the auth store.

    openclaw doesn't ship a delete subcommand, so we edit auth-profiles.json
    directly. The path is `$OPENCLAW_STATE_DIR/agents/<agentId>/agent/auth-profiles.json`
    or `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` by default.
    profile_id is `<provider>:<name>`.
    """
    profile_id = (payload.get("profile_id") or "").strip()
    if not profile_id or ":" not in profile_id:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": "Missing or malformed profile_id (expected provider:name)",
        })
        return

    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception:
        pass

    state_dir = os.environ.get("OPENCLAW_STATE_DIR", os.path.join(HOME, ".openclaw"))
    import glob
    raw_paths = glob.glob(os.path.join(state_dir, "agents", "*", "agent", "auth-profiles.json"))
    seen = set()
    paths = []
    for p in raw_paths:
        real = os.path.realpath(p)
        if real not in seen:
            seen.add(real)
            paths.append(real)
    if not paths:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": f"No auth-profiles.json found under {state_dir}/agents/*/agent/",
        })
        return

    removed = False
    errors = []
    for path in paths:
        try:
            with open(path, "r") as f:
                doc = json.load(f)
            profiles = doc.get("profiles", {})
            if profile_id in profiles:
                del profiles[profile_id]
                # Atomic write: tmp + rename.
                tmp = path + ".tmp"
                with open(tmp, "w") as f:
                    json.dump(doc, f, indent=2)
                os.replace(tmp, path)
                removed = True
                log(f"Removed profile {profile_id} from {path}")
        except Exception as e:
            errors.append(f"{path}: {e}")

    if removed:
        api_rpc("complete_command", {
            "p_command_id": cmd_id, "p_exit_code": 0,
            "p_stdout": f"Removed {profile_id}",
            "p_stderr": "; ".join(errors) if errors else None,
        })
    else:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None,
            "p_error": (
                f"Profile {profile_id} not found"
                + (f" (errors: {'; '.join(errors)})" if errors else "")
            ),
        })


def handle_auth_refresh(cmd_id, payload):
    """Probe a single profile (or all) and return current health."""
    profile_id = payload.get("profile_id")  # Optional.
    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception:
        pass

    args = ["openclaw", "models", "status", "--json", "--probe"]
    if profile_id and ":" in profile_id:
        provider, name = profile_id.split(":", 1)
        args += ["--probe-provider", provider, "--probe-profile", name]

    try:
        result = subprocess.run(
            args, capture_output=True, text=True,
            timeout=60, env={**os.environ, "HOME": HOME},
        )
        api_rpc("complete_command" if result.returncode == 0 else "fail_command", {
            "p_command_id": cmd_id,
            "p_exit_code": result.returncode,
            "p_stdout": (result.stdout or "")[-32000:],
            "p_stderr": (result.stderr or "")[-2000:],
            **(
                {"p_error": f"openclaw exit {result.returncode}"}
                if result.returncode != 0 else {}
            ),
        })
    except Exception as e:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None, "p_error": str(e),
        })


def handle_auth_set_default(cmd_id, payload):
    """Set the default provider/model on this gateway.

    payload: { provider: str, profile_name?: str }
       or  : { model: str } — legacy provider/model format.

    Tries `openclaw models set-default --provider <id>` first; if that
    subcommand doesn't exist, falls back to `openclaw models set <provider>`.
    """
    provider = (payload.get("provider") or "").strip()
    model = (payload.get("model") or "").strip()
    target = provider or model
    if not target:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None, "p_error": "Missing provider or model",
        })
        return

    try:
        api_rpc("start_command", {"p_command_id": cmd_id})
    except Exception:
        pass

    profile_name = (payload.get("profile_name") or "default").strip() or "default"
    args = ["openclaw", "models", "set-default", "--provider", target, "--profile-id", profile_name]
    try:
        probe = subprocess.run(
            args, capture_output=True, text=True, timeout=15,
            env={**os.environ, "HOME": HOME},
        )
        if probe.returncode != 0:
            args = ["openclaw", "models", "set", target]
    except Exception:
        args = ["openclaw", "models", "set", target]
    try:
        result = subprocess.run(
            args, capture_output=True, text=True,
            timeout=30, env={**os.environ, "HOME": HOME},
        )
        if result.returncode == 0:
            api_rpc("complete_command", {
                "p_command_id": cmd_id, "p_exit_code": 0,
                "p_stdout": (result.stdout or "")[-2000:],
                "p_stderr": (result.stderr or "")[-2000:],
            })
        else:
            api_rpc("fail_command", {
                "p_command_id": cmd_id, "p_exit_code": result.returncode,
                "p_stdout": (result.stdout or "")[-2000:],
                "p_stderr": (result.stderr or "")[-2000:],
                "p_error": f"openclaw exit {result.returncode}",
            })
    except Exception as e:
        api_rpc("fail_command", {
            "p_command_id": cmd_id, "p_exit_code": None,
            "p_stdout": None, "p_stderr": None, "p_error": str(e),
        })


def sync_to_shared_auth():
    """Copy the latest auth-profiles.json into shared-auth and propagate to all
    agent directories so every agent (existing and future) has credentials."""
    state_dir = os.environ.get("OPENCLAW_STATE_DIR", os.path.join(HOME, ".openclaw"))
    shared_dir = os.path.join(state_dir, "shared-auth")
    shared_path = os.path.join(shared_dir, "auth-profiles.json")

    import glob as _glob
    import shutil

    agent_dirs = _glob.glob(os.path.join(state_dir, "agents", "*", "agent"))
    agent_auth_files = [os.path.join(d, "auth-profiles.json") for d in agent_dirs]
    existing = [p for p in agent_auth_files if os.path.exists(p)]

    if not existing:
        # openclaw may have written to a gateway-level auth location
        gateway_auth = os.path.join(state_dir, "auth-profiles.json")
        if os.path.exists(gateway_auth):
            existing = [gateway_auth]
        else:
            return

    best = None
    best_mtime = 0
    seen = set()
    for p in existing:
        real = os.path.realpath(p)
        if real in seen:
            continue
        if os.path.exists(shared_path) and real == os.path.realpath(shared_path):
            continue
        seen.add(real)
        try:
            mt = os.path.getmtime(real)
            if mt > best_mtime:
                best_mtime = mt
                best = real
        except OSError:
            continue

    if not best:
        return

    try:
        os.makedirs(shared_dir, exist_ok=True)
        shutil.copy2(best, shared_path)
        log(f"Synced auth-profiles to shared-auth from {best}")
    except Exception as e:
        log(f"Failed to sync shared-auth: {e}")
        return

    # Also sync auth-state.json if present alongside the best source
    best_dir = os.path.dirname(best)
    state_src = os.path.join(best_dir, "auth-state.json")
    state_dst = os.path.join(shared_dir, "auth-state.json")
    if os.path.exists(state_src):
        try:
            shutil.copy2(state_src, state_dst)
        except Exception:
            pass

    for agent_dir in agent_dirs:
        target = os.path.join(agent_dir, "auth-profiles.json")
        real_target = os.path.realpath(target) if os.path.exists(target) else None
        real_shared = os.path.realpath(shared_path)
        if real_target == real_shared:
            continue
        try:
            if os.path.islink(target):
                os.unlink(target)
            elif os.path.exists(target):
                os.unlink(target)
            os.symlink(shared_path, target)
            # Also link auth-state.json
            state_target = os.path.join(agent_dir, "auth-state.json")
            if os.path.exists(state_dst):
                if os.path.islink(state_target) or os.path.exists(state_target):
                    os.unlink(state_target)
                os.symlink(state_dst, state_target)
        except Exception as e:
            log(f"Failed to link auth to {agent_dir}: {e}")


CONNECTION_HANDLERS = {
    "auth_set_api_key": handle_auth_set_api_key,
    "auth_start": handle_auth_start,
    "auth_paste": handle_auth_paste,
    "auth_list": handle_auth_list,
    "auth_remove": handle_auth_remove,
    "auth_refresh": handle_auth_refresh,
    "auth_set_default": handle_auth_set_default,
}

# auth_start blocks for up to 5 minutes waiting for the user to paste back.
# If we ran it on the main lease loop, no other commands (including the
# auth_paste that completes the flow!) would process until it returned.
# So these specific actions run in their own daemon thread.
ASYNC_CONNECTION_ACTIONS = {"auth_start"}


def execute_command(command_row):
    """Execute a single command and report results back to Supabase."""
    cmd_id = command_row["id"]
    action = command_row["action"]
    agent_slug = command_row.get("agent_slug")
    payload = command_row.get("payload") or {}

    log(f"Processing command {cmd_id}: {action}" + (f" for {agent_slug}" if agent_slug else ""))

    # Connection actions don't fit the build_command/subprocess.run shape — they
    # need long-lived processes, intermediate state writes, and stdin pipes. Each
    # handler manages its own start/complete/fail RPC calls.
    handler = CONNECTION_HANDLERS.get(action)
    if handler:
        def run_handler():
            try:
                handler(cmd_id, payload)
            except Exception as e:
                log(f"Connection handler {action} crashed: {e}")
                try:
                    api_rpc("fail_command", {
                        "p_command_id": cmd_id, "p_exit_code": None,
                        "p_stdout": None, "p_stderr": None,
                        "p_error": f"Handler crashed: {e}",
                    })
                except Exception:
                    pass
        if action in ASYNC_CONNECTION_ACTIONS:
            # Detach so the main loop can process auth_paste etc.
            threading.Thread(target=run_handler, daemon=True).start()
        else:
            run_handler()
        return

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

            # Scrub credential tokens from payload after successful provisioning
            if action == "provision":
                token_keys = [k for k in payload if k.endswith("_token")]
                if token_keys:
                    try:
                        scrubbed = {k: v for k, v in payload.items() if not k.endswith("_token")}
                        scrubbed["tokens_scrubbed"] = True
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


GATEWAY_PAUSED = False

HEARTBEAT_FILE = "/tmp/heartbeat.txt"

def heartbeat_once():
    """Upsert this gateway's row in the gateways table.
    Preserves paused/hibernating status set by the UI — only writes 'ready'
    when the gateway is not in a user- or system-paused state.
    Also writes a local file for Docker healthcheck consumption."""
    global GATEWAY_PAUSED
    try:
        rows = api_get("gateways", {
            "select": "status",
            "slug": f"eq.{GATEWAY_ID}",
            "limit": "1",
        })
        if rows and rows[0].get("status") in ("paused", "hibernating"):
            GATEWAY_PAUSED = True
            api_patch_by_slug("gateways", GATEWAY_ID, {"last_seen_at": now_iso()})
        else:
            GATEWAY_PAUSED = False
            api_post_upsert("gateways", {
                "slug": GATEWAY_ID,
                "label": GATEWAY_LABEL,
                "status": "ready",
                "last_seen_at": now_iso(),
                "tenant_id": TENANT_ID,
            }, on_conflict="tenant_id,slug")
    except Exception as e:
        log(f"heartbeat failed: {e}")
    try:
        with open(HEARTBEAT_FILE, "w") as f:
            f.write(now_iso())
    except OSError:
        pass


def api_patch_by_slug(table, slug, payload):
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/{table}?" + urllib.parse.urlencode({"slug": f"eq.{slug}"})
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="PATCH", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


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


def wait_for_supabase_config():
    """Populate SUPABASE_URL + SUPABASE_KEY globals, blocking until resolved.

    Source precedence:
      1. Env vars (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) — immediate.
      2. Project registry at /config — polled every 5s until the user
         completes browser onboarding.
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

    # Start the git backup sweep (commits dirty worktrees + ff pulls, every
    # GIT_SYNC_INTERVAL seconds). Does nothing if no remote is configured.
    start_backup_sweep()

    # Start Realtime listener (blocks)
    listener = CommandListener()
    listener.run()


if __name__ == "__main__":
    main()
