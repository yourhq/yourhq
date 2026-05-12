#!/usr/bin/env python3
"""
files-api — small HTTP server exposing agent worktrees to the HQ UI.

Runs inside the gateway container alongside the OpenClaw gateway process.
Never bound to a publicly-routable interface; the two supported bindings
are Docker-internal (default) and Tailscale.

Auth: every request must carry `Authorization: Bearer $GATEWAY_AUTH_TOKEN`
(constant-time compared).

Endpoints:
  GET    /healthz                           -> {"ok": true}
  GET    /branches/:branch/tree             -> [{path, type, sha}]
  GET    /branches/:branch/files/<path>     -> {path, content, sha}
  PUT    /branches/:branch/files/<path>     -> {path, sha}      (body: {content, sha?})
  POST   /branches/:branch/files/<path>     -> {path, sha}      (body: {content})
  DELETE /branches/:branch/files/<path>     -> {ok: true}       (body: {sha?})
  GET    /browser/:slug/state               -> {url, title, tabs[]}
  GET    /browser/:slug/screenshot           -> image/jpeg

The `branch` segment is URL-encoded (slashes become %2F) and must already
exist as a worktree at $HOME/.openclaw/workspace-<branch>. Writes commit
to the branch immediately with a generated message.
"""

from __future__ import annotations

import base64
import hmac
import json
import os
import re
import subprocess
import sys
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import websocket

# ── Config ─────────────────────────────────────────────────────────────

GATEWAY_AUTH_TOKEN = os.environ.get("GATEWAY_AUTH_TOKEN", "")
FILES_API_BIND = os.environ.get("FILES_API_BIND", "docker")
FILES_API_PORT = int(os.environ.get("FILES_API_PORT", "18790"))
TAILSCALE_SOCKET = os.environ.get("TAILSCALE_SOCKET", "")
HOME = os.path.expanduser("~")
OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", os.path.join(HOME, ".openclaw"))

# Branch-name safety: we only accept characters that appear in our agent
# branch names. Forward slashes are permitted (e.g., "workspace/alice").
BRANCH_RE = re.compile(r"^[A-Za-z0-9._/-]+$")


def log(msg: str) -> None:
    print(f"[files-api] {msg}", flush=True)


# ── Bind-address resolution ────────────────────────────────────────────


def resolve_bind_address() -> str:
    if FILES_API_BIND == "docker":
        # Docker's internal DNS makes this reachable at the service name
        # from other containers. Never published to host.
        return "0.0.0.0"
    if FILES_API_BIND == "off":
        log("FILES_API_BIND=off; exiting without starting server.")
        sys.exit(0)
    if FILES_API_BIND == "tailscale":
        # Query tailscaled for the interface IP. If Tailscale isn't up,
        # fall back to 0.0.0.0 (still inside Docker) rather than failing.
        if not TAILSCALE_SOCKET:
            log("FILES_API_BIND=tailscale but no TAILSCALE_SOCKET set; falling back to 0.0.0.0.")
            return "0.0.0.0"
        try:
            out = (
                subprocess.check_output(
                    ["/usr/local/bin/tailscale", "--socket", TAILSCALE_SOCKET, "ip", "-4"],
                    text=True,
                    timeout=5,
                )
                .strip()
                .splitlines()
            )
            if out:
                log(f"Binding to Tailscale IP {out[0]}.")
                return out[0]
        except Exception as e:
            log(f"Could not resolve Tailscale IP ({e}); falling back to 0.0.0.0.")
        return "0.0.0.0"
    log(f"Unknown FILES_API_BIND={FILES_API_BIND!r}; defaulting to 0.0.0.0.")
    return "0.0.0.0"


# ── Git helpers ────────────────────────────────────────────────────────


def worktree_path(branch: str) -> Path:
    return Path(OPENCLAW_HOME) / f"workspace-{branch}"


def safe_join(root: Path, relative: str) -> Path:
    """Join relative path to root, refusing any path that escapes root."""
    candidate = (root / relative).resolve()
    root_resolved = root.resolve()
    if root_resolved != candidate and root_resolved not in candidate.parents:
        raise ValueError(f"Path {relative!r} escapes worktree")
    return candidate


def git(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed in {root}: {result.stderr.strip() or result.stdout.strip()}")
    return result.stdout


def git_commit(root: Path, message: str) -> None:
    # Skip if nothing staged.
    status = git(root, "status", "--porcelain")
    if not status.strip():
        return
    git(root, "commit", "-q", "-m", message)


def sha_for_path(root: Path, relative: str) -> str:
    # The blob SHA for the current HEAD version of the file. Used as a
    # version marker the UI can pass back in a PUT to detect stale edits.
    try:
        out = git(root, "ls-tree", "HEAD", relative).strip()
    except RuntimeError:
        return ""
    if not out:
        return ""
    # Format: "<mode> <type> <sha>\t<path>"
    parts = out.split()
    if len(parts) >= 3:
        return parts[2]
    return ""


def list_tree(root: Path) -> list[dict]:
    try:
        out = git(root, "ls-tree", "-r", "HEAD")
    except RuntimeError:
        return []
    entries = []
    for line in out.splitlines():
        if not line.strip():
            continue
        # "<mode> <type> <sha>\t<path>"
        head, path = line.split("\t", 1)
        mode, kind, sha = head.split()
        entries.append({"path": path, "type": kind, "sha": sha, "mode": mode})
    return entries


# ── Browser / CDP helpers ──────────────────────────────────────────────

SLUG_RE = re.compile(r"^[A-Za-z0-9_-]+$")
OPENCLAW_CONFIG = Path(OPENCLAW_HOME) / "openclaw.json"


def _get_cdp_port(slug: str) -> int | None:
    """Read the CDP port for an agent's browser profile from openclaw.json."""
    try:
        cfg = json.loads(OPENCLAW_CONFIG.read_text())
        return cfg.get("browser", {}).get("profiles", {}).get(slug, {}).get("cdpPort")
    except (OSError, json.JSONDecodeError):
        return None


def _get_browser_tabs(cdp_port: int) -> list[dict]:
    """Fetch open tabs from Chrome's /json endpoint."""
    url = f"http://127.0.0.1:{cdp_port}/json"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            targets = json.loads(resp.read())
    except Exception:
        return []
    tabs = []
    for t in targets:
        if t.get("type") != "page":
            continue
        tabs.append(
            {
                "id": t.get("id", ""),
                "url": t.get("url", ""),
                "title": t.get("title", ""),
            }
        )
    return tabs


def _capture_screenshot(cdp_port: int, quality: int = 50) -> bytes | None:
    """Capture a JPEG screenshot of the active page via CDP WebSocket."""
    url = f"http://127.0.0.1:{cdp_port}/json"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            targets = json.loads(resp.read())
    except Exception:
        return None

    ws_url = None
    for t in targets:
        if t.get("type") == "page":
            ws_url = t.get("webSocketDebuggerUrl")
            break
    if not ws_url:
        return None

    try:
        ws = websocket.create_connection(ws_url, timeout=5)
        try:
            ws.send(
                json.dumps(
                    {
                        "id": 1,
                        "method": "Page.captureScreenshot",
                        "params": {"format": "jpeg", "quality": quality},
                    }
                )
            )
            result = json.loads(ws.recv())
            data_b64 = result.get("result", {}).get("data")
            if not data_b64:
                return None
            return base64.b64decode(data_b64)
        finally:
            ws.close()
    except Exception:
        return None


# ── HTTP handler ───────────────────────────────────────────────────────


class Handler(BaseHTTPRequestHandler):
    server_version = "hq-files-api/0.1"

    # Silence the default access log (we'll log errors explicitly).
    def log_message(self, fmt: str, *args) -> None:  # noqa: ARG002
        return

    # ── Auth ────────────────────────────────────────────────────────
    def _authorized(self) -> bool:
        if not GATEWAY_AUTH_TOKEN:
            return False
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return False
        presented = auth[len("Bearer ") :].strip()
        return hmac.compare_digest(presented, GATEWAY_AUTH_TOKEN)

    # ── Helpers ─────────────────────────────────────────────────────
    def _send_json(self, status: int, body) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _error(self, status: int, message: str) -> None:
        self._send_json(status, {"error": message})

    def _read_body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            raise ValueError("Invalid JSON body")

    # ── Dispatch ────────────────────────────────────────────────────
    def _route(self) -> tuple[str | None, str | None, str | None]:
        """Return (kind, segment, path) where kind identifies the handler."""
        parsed = urllib.parse.urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]
        if not parts:
            return None, None, None
        if parts == ["healthz"]:
            return "healthz", None, None
        # Browser endpoints: /browser/{slug}/state, /browser/{slug}/screenshot
        if len(parts) == 3 and parts[0] == "browser":
            slug = urllib.parse.unquote(parts[1])
            if not SLUG_RE.match(slug):
                return None, None, None
            if parts[2] == "state":
                return "browser_state", slug, None
            if parts[2] == "screenshot":
                return "browser_screenshot", slug, None
        if len(parts) == 2 and parts[0] == "sources":
            if parts[1] == "validate":
                return "sources_validate", None, None
            if parts[1] == "browse":
                return "sources_browse", None, None
        if len(parts) >= 3 and parts[0] == "branches":
            branch = urllib.parse.unquote(parts[1])
            if not BRANCH_RE.match(branch):
                return None, None, None
            if ".." in branch.split("/"):
                return None, None, None
            if parts[2] == "tree" and len(parts) == 3:
                return "tree", branch, None
            if parts[2] == "files" and len(parts) >= 4:
                filepath = "/".join(urllib.parse.unquote(p) for p in parts[3:])
                if ".." in filepath.split("/"):
                    return None, None, None
                return "file", branch, filepath
        return None, None, None

    def do_GET(self) -> None:
        kind, segment, path = self._route()
        if kind == "healthz":
            return self._send_json(200, {"ok": True})
        if not self._authorized():
            return self._error(401, "Unauthorized")
        if kind == "browser_state":
            assert segment is not None
            cdp_port = _get_cdp_port(segment)
            if cdp_port is None:
                return self._error(404, f"No browser profile for agent {segment!r}")
            tabs = _get_browser_tabs(cdp_port)
            if not tabs:
                return self._error(503, "Chrome is not reachable")
            active = tabs[0]
            return self._send_json(
                200,
                {
                    "url": active.get("url"),
                    "title": active.get("title"),
                    "tabs": tabs,
                },
            )
        if kind == "browser_screenshot":
            assert segment is not None
            cdp_port = _get_cdp_port(segment)
            if cdp_port is None:
                return self._error(404, f"No browser profile for agent {segment!r}")
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            quality = int(qs.get("quality", ["50"])[0])
            img = _capture_screenshot(cdp_port, quality=quality)
            if img is None:
                return self._error(503, "Chrome is not reachable or screenshot failed")
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(img)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(img)
            return
        if kind == "tree":
            assert segment is not None
            root = worktree_path(segment)
            if not root.is_dir():
                return self._error(404, f"Worktree not found for branch {segment!r}")
            return self._send_json(200, list_tree(root))
        if kind == "file":
            assert segment is not None and path is not None
            root = worktree_path(segment)
            if not root.is_dir():
                return self._error(404, f"Worktree not found for branch {segment!r}")
            try:
                full = safe_join(root, path)
            except ValueError as e:
                return self._error(400, str(e))
            if not full.is_file():
                return self._error(404, f"File not found: {path}")
            try:
                content = full.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                return self._error(415, "Binary files not supported yet")
            return self._send_json(
                200,
                {
                    "path": path,
                    "content": content,
                    "sha": sha_for_path(root, path),
                },
            )
        return self._error(404, "Not found")

    def do_PUT(self) -> None:
        if not self._authorized():
            return self._error(401, "Unauthorized")
        kind, segment, path = self._route()
        if kind != "file":
            return self._error(404, "Not found")
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))
        if "content" not in body or not isinstance(body["content"], str):
            return self._error(400, "Missing 'content' string in body")

        assert segment is not None and path is not None
        root = worktree_path(segment)
        if not root.is_dir():
            return self._error(404, f"Worktree not found for branch {segment!r}")
        try:
            full = safe_join(root, path)
        except ValueError as e:
            return self._error(400, str(e))

        if full.is_file() and body.get("sha"):
            current = sha_for_path(root, path)
            if current and current != body["sha"]:
                return self._error(409, f"File has changed on disk (current sha {current})")

        try:
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_text(body["content"], encoding="utf-8")
            git(root, "add", path)
            git_commit(root, f"edit via UI: {path}")
            new_sha = sha_for_path(root, path)
            return self._send_json(200, {"path": path, "sha": new_sha})
        except Exception as e:
            return self._error(500, f"Write failed: {e}")

    def do_POST(self) -> None:
        if not self._authorized():
            return self._error(401, "Unauthorized")
        kind, segment, path = self._route()

        if kind == "sources_validate":
            return self._handle_sources_validate()
        if kind == "sources_browse":
            return self._handle_sources_browse()

        if kind != "file":
            return self._error(404, "Not found")
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))

        assert segment is not None and path is not None
        root = worktree_path(segment)
        if not root.is_dir():
            return self._error(404, f"Worktree not found for branch {segment!r}")
        try:
            full = safe_join(root, path)
        except ValueError as e:
            return self._error(400, str(e))
        if full.exists():
            return self._error(409, "File already exists")
        try:
            full.parent.mkdir(parents=True, exist_ok=True)
            full.write_text(body.get("content", "") or "", encoding="utf-8")
            git(root, "add", path)
            git_commit(root, f"create via UI: {path}")
            return self._send_json(
                201,
                {
                    "path": path,
                    "sha": sha_for_path(root, path),
                },
            )
        except Exception as e:
            return self._error(500, f"Create failed: {e}")

    # ── Source connector endpoints ────────────────────────────────────

    def _handle_sources_validate(self) -> None:
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))

        provider = body.get("provider")
        credentials = body.get("credentials")
        if not provider or not credentials:
            return self._error(400, "provider and credentials are required")

        try:
            from connectors import get_connector

            connector = get_connector(provider)
            if not connector:
                return self._send_json(200, {"valid": False, "error": f"Unknown provider: {provider}"})

            valid = connector.validate_credentials(credentials)
            if valid:
                account_name = credentials.get("account_name")
                if not account_name and hasattr(connector, "_get_account_name"):
                    account_name = connector._get_account_name(credentials)
                return self._send_json(200, {"valid": True, "account_name": account_name})
            return self._send_json(200, {"valid": False, "error": "Invalid credentials"})
        except Exception as e:
            return self._send_json(200, {"valid": False, "error": str(e)})

    def _handle_sources_browse(self) -> None:
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))

        connection_id = body.get("connection_id")
        parent_id = body.get("parent_id")
        search = body.get("search")

        if not connection_id:
            return self._error(400, "connection_id is required")

        try:
            from connectors import get_connector
            from daemons.source_sync import _resolve_credentials

            supabase_url = os.environ.get("SUPABASE_URL", "")
            supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            if not supabase_url or not supabase_key:
                return self._error(500, "Supabase not configured")

            url = f"{supabase_url}/rest/v1/source_connections?id=eq.{connection_id}&select=provider,credentials&limit=1"
            req = urllib.request.Request(
                url,
                headers={
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                rows = json.loads(resp.read().decode())

            if not rows:
                return self._error(404, "Connection not found")

            connection = rows[0]
            provider = connection["provider"]
            creds = _resolve_credentials(provider, connection_id, dict(connection.get("credentials") or {}))

            connector = get_connector(provider)
            if not connector:
                return self._error(400, f"Unknown provider: {provider}")

            result = connector.browse(creds, parent_id=parent_id, search=search)
            items = [
                {
                    "external_id": item.external_id,
                    "title": item.title,
                    "source_url": item.source_url,
                    "item_type": item.item_type,
                    "has_children": item.has_children,
                }
                for item in result.items
            ]
            return self._send_json(200, {"items": items})
        except Exception as e:
            return self._error(500, f"Browse failed: {e}")

    def do_DELETE(self) -> None:
        if not self._authorized():
            return self._error(401, "Unauthorized")
        kind, segment, path = self._route()
        if kind != "file":
            return self._error(404, "Not found")
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))

        assert segment is not None and path is not None
        root = worktree_path(segment)
        if not root.is_dir():
            return self._error(404, f"Worktree not found for branch {segment!r}")
        try:
            full = safe_join(root, path)
        except ValueError as e:
            return self._error(400, str(e))
        if not full.is_file():
            return self._error(404, f"File not found: {path}")
        if body.get("sha"):
            current = sha_for_path(root, path)
            if current and current != body["sha"]:
                return self._error(409, f"File has changed on disk (current sha {current})")
        try:
            git(root, "rm", path)
            git_commit(root, f"delete via UI: {path}")
            return self._send_json(200, {"ok": True})
        except Exception as e:
            return self._error(500, f"Delete failed: {e}")


# ── Main ───────────────────────────────────────────────────────────────


def main() -> None:
    if not GATEWAY_AUTH_TOKEN:
        log("GATEWAY_AUTH_TOKEN not set; files-API refusing to start.")
        sys.exit(1)

    addr = resolve_bind_address()
    httpd = ThreadingHTTPServer((addr, FILES_API_PORT), Handler)
    log(f"Listening on http://{addr}:{FILES_API_PORT} (bind mode: {FILES_API_BIND})")

    # Run in a thread so the gateway's other signal handlers can tear us
    # down on container stop.
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    t.join()


if __name__ == "__main__":
    main()
