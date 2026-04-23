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

The `branch` segment is URL-encoded (slashes become %2F) and must already
exist as a worktree at $HOME/.openclaw/workspace-<branch>. Writes commit
to the branch immediately with a generated message.
"""
from __future__ import annotations

import hmac
import json
import os
import re
import subprocess
import sys
import threading
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

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
            out = subprocess.check_output(
                ["/usr/local/bin/tailscale", "--socket", TAILSCALE_SOCKET, "ip", "-4"],
                text=True,
                timeout=5,
            ).strip().splitlines()
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
        raise RuntimeError(
            f"git {' '.join(args)} failed in {root}: {result.stderr.strip() or result.stdout.strip()}"
        )
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
        presented = auth[len("Bearer "):].strip()
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
        """Return (kind, branch, path) where kind in {'healthz','tree','file'}."""
        parsed = urllib.parse.urlparse(self.path)
        parts = [p for p in parsed.path.split("/") if p]
        if not parts:
            return None, None, None
        if parts == ["healthz"]:
            return "healthz", None, None
        if len(parts) >= 3 and parts[0] == "branches":
            branch = urllib.parse.unquote(parts[1])
            if not BRANCH_RE.match(branch):
                return None, None, None
            # Defense in depth: even though safe_join re-resolves paths and
            # the regex above restricts characters, explicitly reject any
            # segment equal to "..". Prevents cute traversal tricks.
            if ".." in branch.split("/"):
                return None, None, None
            if parts[2] == "tree" and len(parts) == 3:
                return "tree", branch, None
            if parts[2] == "files" and len(parts) >= 4:
                filepath = "/".join(urllib.parse.unquote(p) for p in parts[3:])
                # Same check for the filepath segments.
                if ".." in filepath.split("/"):
                    return None, None, None
                return "file", branch, filepath
        return None, None, None

    def do_GET(self) -> None:
        kind, branch, path = self._route()
        if kind == "healthz":
            return self._send_json(200, {"ok": True})
        if not self._authorized():
            return self._error(401, "Unauthorized")
        if kind == "tree":
            assert branch is not None
            root = worktree_path(branch)
            if not root.is_dir():
                return self._error(404, f"Worktree not found for branch {branch!r}")
            return self._send_json(200, list_tree(root))
        if kind == "file":
            assert branch is not None and path is not None
            root = worktree_path(branch)
            if not root.is_dir():
                return self._error(404, f"Worktree not found for branch {branch!r}")
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
            return self._send_json(200, {
                "path": path,
                "content": content,
                "sha": sha_for_path(root, path),
            })
        return self._error(404, "Not found")

    def do_PUT(self) -> None:
        if not self._authorized():
            return self._error(401, "Unauthorized")
        kind, branch, path = self._route()
        if kind != "file":
            return self._error(404, "Not found")
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))
        if "content" not in body or not isinstance(body["content"], str):
            return self._error(400, "Missing 'content' string in body")

        assert branch is not None and path is not None
        root = worktree_path(branch)
        if not root.is_dir():
            return self._error(404, f"Worktree not found for branch {branch!r}")
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
        kind, branch, path = self._route()
        if kind != "file":
            return self._error(404, "Not found")
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))

        assert branch is not None and path is not None
        root = worktree_path(branch)
        if not root.is_dir():
            return self._error(404, f"Worktree not found for branch {branch!r}")
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
            return self._send_json(201, {
                "path": path,
                "sha": sha_for_path(root, path),
            })
        except Exception as e:
            return self._error(500, f"Create failed: {e}")

    def do_DELETE(self) -> None:
        if not self._authorized():
            return self._error(401, "Unauthorized")
        kind, branch, path = self._route()
        if kind != "file":
            return self._error(404, "Not found")
        try:
            body = self._read_body()
        except ValueError as e:
            return self._error(400, str(e))

        assert branch is not None and path is not None
        root = worktree_path(branch)
        if not root.is_dir():
            return self._error(404, f"Worktree not found for branch {branch!r}")
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
