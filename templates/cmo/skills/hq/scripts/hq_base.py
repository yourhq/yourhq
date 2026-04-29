"""
HQ — shared base module.

All hq_* scripts import from here. Handles:
- Supabase connection via env vars
- Agent identity resolution
- Audit logging
- Embedding generation
"""

import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────
# openclaw 2026.4.x has no per-agent env mechanism, but each agent
# workspace contains an agent.json with the canonical slug. We search
# upward from cwd and from this script's own location to find it.

def _resolve_agent_slug() -> str:
    # 1. Explicit env override always wins
    env_slug = os.environ.get("AGENT_SLUG", "").strip()
    if env_slug:
        return env_slug
    # 2. Walk up from cwd looking for an agent.json
    for base in (Path.cwd(), Path(__file__).resolve().parent):
        for parent in (base, *base.parents):
            candidate = parent / "agent.json"
            if candidate.is_file():
                try:
                    data = json.loads(candidate.read_text())
                    slug = str(data.get("slug", "")).strip()
                    if slug:
                        return slug
                except (json.JSONDecodeError, OSError):
                    pass
    # 3. Last-ditch fallback: cwd basename (original behavior)
    return Path.cwd().name


def _resolve_agent_channel() -> str:
    for base in (Path.cwd(), Path(__file__).resolve().parent):
        for parent in (base, *base.parents):
            candidate = parent / "agent.json"
            if candidate.is_file():
                try:
                    data = json.loads(candidate.read_text())
                    ch = str(data.get("channel", "")).strip()
                    if ch:
                        return ch
                except (json.JSONDecodeError, OSError):
                    pass
    return "telegram"


SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
AGENT_SLUG = _resolve_agent_slug()
AGENT_CHANNEL = _resolve_agent_channel()
EMBEDDING_API_KEY = os.environ.get("EMBEDDING_API_KEY", "")
EMBEDDING_MODEL = "text-embedding-3-small"


def check_env():
    missing = []
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_KEY:
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    if not AGENT_SLUG:
        missing.append("AGENT_SLUG")
    if missing:
        print(json.dumps({"error": "missing_env_vars", "missing": missing}), file=sys.stderr)
        sys.exit(1)


def base_url(table):
    return SUPABASE_URL.rstrip("/") + f"/rest/v1/{table}"


def headers(*, prefer=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


# ── HTTP helpers ───────────────────────────────────────────────────────

def _read_json_response(resp):
    body = resp.read().decode()
    return json.loads(body) if body else None


def _raise_http_error(err):
    body = None
    try:
        body = err.read().decode()
    except Exception:
        body = None

    details = {
        "status": getattr(err, "code", None),
        "reason": getattr(err, "reason", None),
        "body": body,
    }
    raise RuntimeError(f"HQ API error: {json.dumps(details, ensure_ascii=False)}")


def api_get(table, params):
    url = base_url(table) + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=headers())
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return _read_json_response(r)
    except urllib.error.HTTPError as e:
        _raise_http_error(e)


def api_post(table, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        base_url(table), headers=headers(prefer="return=representation"),
        method="POST", data=data,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return _read_json_response(r)
    except urllib.error.HTTPError as e:
        _raise_http_error(e)


def api_patch(table, record_id, payload):
    url = base_url(table) + "?" + urllib.parse.urlencode({"id": f"eq.{record_id}"})
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, headers=headers(prefer="return=representation"),
        method="PATCH", data=data,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return _read_json_response(r)
    except urllib.error.HTTPError as e:
        _raise_http_error(e)


def api_rpc(function_name, payload):
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/rpc/{function_name}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, headers=headers(), method="POST", data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return _read_json_response(r)
    except urllib.error.HTTPError as e:
        _raise_http_error(e)


# ── Agent identity ─────────────────────────────────────────────────────

_agent_id_cache = None


def get_agent_id():
    """Resolve the agent's UUID from the agents table by slug."""
    global _agent_id_cache
    if _agent_id_cache:
        return _agent_id_cache
    rows = api_get("agents", {"select": "id", "slug": f"eq.{AGENT_SLUG}", "limit": "1"})
    if rows:
        _agent_id_cache = rows[0]["id"]
        return _agent_id_cache
    return None


# ── Audit logging ──────────────────────────────────────────────────────

def audit(module, entity_type, entity_id, action, summary=None, changes=None):
    agent_id = get_agent_id()
    payload = {
        "actor_type": "agent",
        "actor_agent_id": agent_id,
        "module": module,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "action": action,
        "summary": summary,
        "changes": changes,
    }
    try:
        api_post("audit_log", payload)
    except Exception as e:
        print(f"[audit] warning: {e}", file=sys.stderr)


# ── Embedding ──────────────────────────────────────────────────────────

def generate_embedding(text):
    """Generate embedding via OpenAI API using EMBEDDING_API_KEY."""
    if not EMBEDDING_API_KEY:
        return None
    data = json.dumps({
        "model": EMBEDDING_MODEL,
        "input": text[:8000],
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        headers={
            "Authorization": f"Bearer {EMBEDDING_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
        data=data,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read().decode())
    return result["data"][0]["embedding"]


def build_embedding_input(title, content=None, tags=None):
    parts = [title]
    if tags:
        parts.append(", ".join(tags))
    if content:
        parts.append(content)
    return "\n\n".join(parts)


# ── Output helper ──────────────────────────────────────────────────────

def output(data):
    print(json.dumps(data, indent=2, ensure_ascii=False))
