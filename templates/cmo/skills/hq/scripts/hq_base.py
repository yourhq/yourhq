"""
HQ — shared base module.

All hq_* scripts import from here. Handles:
- Supabase connection via env vars
- Agent identity resolution
- Audit logging
- Local embedding generation
"""

import hashlib
import json
import os
import re as _re
import sys
import urllib.error
import urllib.parse
import urllib.request
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


def _load_secrets():
    slug = _resolve_agent_slug()
    secrets_dir = Path(os.environ.get("OPENCLAW_HOME", str(Path.home() / ".openclaw"))) / "secrets" / "agents"
    env_file = secrets_dir / f"{slug}.env"
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                v = v[1:-1]
            os.environ.setdefault(k.strip(), v)


_load_secrets()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
AGENT_SLUG = _resolve_agent_slug()
AGENT_CHANNEL = _resolve_agent_channel()
EMBEDDER_URL = os.environ.get("EMBEDDER_URL", "http://embedder:18801").rstrip("/")
EMBEDDING_MODEL = os.environ.get("EMBEDDER_MODEL", "BAAI/bge-small-en-v1.5")


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
        base_url(table),
        headers=headers(prefer="return=representation"),
        method="POST",
        data=data,
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
        url,
        headers=headers(prefer="return=representation"),
        method="PATCH",
        data=data,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return _read_json_response(r)
    except urllib.error.HTTPError as e:
        _raise_http_error(e)


def api_delete(table, record_id):
    url = base_url(table) + "?" + urllib.parse.urlencode({"id": f"eq.{record_id}"})
    req = urllib.request.Request(
        url,
        headers=headers(prefer="return=representation"),
        method="DELETE",
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


_owner_handle_cache = None


def get_owner_handle():
    """Resolve the workspace owner's preferred name for @mentions."""
    global _owner_handle_cache
    if _owner_handle_cache is not None:
        return _owner_handle_cache
    try:
        rows = api_get("workspace", {"select": "owner_preferred_name,slug", "limit": "1"})
        if rows:
            name = rows[0].get("owner_preferred_name") or rows[0].get("slug") or "owner"
            _owner_handle_cache = name.lower().replace(" ", "")
        else:
            _owner_handle_cache = "owner"
    except Exception:
        _owner_handle_cache = "owner"
    return _owner_handle_cache


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
    """Generate a local BGE embedding via the HQ embedder service."""
    if not text:
        return None
    data = json.dumps(
        {
            "input": text[:6000],
        }
    ).encode()
    req = urllib.request.Request(
        f"{EMBEDDER_URL}/embed",
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
        data=data,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        result = json.loads(r.read().decode())
    return result.get("embedding")


def extract_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return value
        if isinstance(parsed, (dict, list)):
            return extract_text(parsed)
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return " ".join(part for item in value if (part := extract_text(item)))
    if isinstance(value, dict):
        parts = []
        text = value.get("text")
        if isinstance(text, str):
            parts.append(text)
        for key in ("title", "content", "children"):
            if key in value:
                part = extract_text(value[key])
                if part:
                    parts.append(part)
        for key, item in value.items():
            if key in {"text", "title", "content", "children"}:
                continue
            if isinstance(item, (dict, list)):
                part = extract_text(item)
                if part:
                    parts.append(part)
        return " ".join(parts)
    return ""


def build_embedding_input(title, content=None, tags=None):
    parts = [str(title or "").strip()]
    if tags:
        parts.append(", ".join(str(tag).strip() for tag in tags if str(tag).strip()))
    body = extract_text(content).strip()
    if body:
        parts.append(body)
    return "\n\n".join(part for part in parts if part)[:6000]


def embedding_source_hash(text):
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


# ── Markdown → Tiptap conversion ─────────────────────────────────────


def _parse_inline_marks(text):
    result = []
    pattern = _re.compile(r"(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))")
    last = 0
    for m in pattern.finditer(text):
        if m.start() > last:
            result.append({"type": "text", "text": text[last : m.start()]})
        if m.group(2):
            result.append({"type": "text", "marks": [{"type": "bold"}], "text": m.group(2)})
        elif m.group(3):
            result.append({"type": "text", "marks": [{"type": "italic"}], "text": m.group(3)})
        elif m.group(4):
            result.append({"type": "text", "marks": [{"type": "code"}], "text": m.group(4)})
        elif m.group(5) and m.group(6):
            result.append(
                {
                    "type": "text",
                    "marks": [{"type": "link", "attrs": {"href": m.group(6), "target": "_blank"}}],
                    "text": m.group(5),
                }
            )
        last = m.end()
    if last < len(text):
        result.append({"type": "text", "text": text[last:]})
    return result if result else [{"type": "text", "text": text or " "}]


def markdown_to_tiptap(markdown):
    lines = (markdown or "").split("\n")
    content = []
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.startswith("```"):
            lang = line[3:].strip()
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1
            node = {"type": "codeBlock", "content": [{"type": "text", "text": "\n".join(code_lines)}]}
            if lang:
                node["attrs"] = {"language": lang}
            content.append(node)
            continue

        if line.strip() == "":
            i += 1
            continue

        if _re.match(r"^---+$", line.strip()):
            content.append({"type": "horizontalRule"})
            i += 1
            continue

        hm = _re.match(r"^(#{1,3})\s+(.*)", line)
        if hm:
            content.append(
                {
                    "type": "heading",
                    "attrs": {"level": len(hm.group(1))},
                    "content": _parse_inline_marks(hm.group(2)),
                }
            )
            i += 1
            continue

        if _re.match(r"^[-*]\s", line):
            items = []
            while i < len(lines) and _re.match(r"^[-*]\s", lines[i]):
                items.append(
                    {
                        "type": "listItem",
                        "content": [
                            {"type": "paragraph", "content": _parse_inline_marks(_re.sub(r"^[-*]\s+", "", lines[i]))}
                        ],
                    }
                )
                i += 1
            content.append({"type": "bulletList", "content": items})
            continue

        if _re.match(r"^\d+\.\s", line):
            items = []
            while i < len(lines) and _re.match(r"^\d+\.\s", lines[i]):
                items.append(
                    {
                        "type": "listItem",
                        "content": [
                            {"type": "paragraph", "content": _parse_inline_marks(_re.sub(r"^\d+\.\s+", "", lines[i]))}
                        ],
                    }
                )
                i += 1
            content.append({"type": "orderedList", "content": items})
            continue

        if line.startswith("> "):
            quote_lines = []
            while i < len(lines) and lines[i].startswith("> "):
                quote_lines.append(lines[i][2:])
                i += 1
            content.append(
                {
                    "type": "blockquote",
                    "content": [{"type": "paragraph", "content": _parse_inline_marks(" ".join(quote_lines))}],
                }
            )
            continue

        content.append({"type": "paragraph", "content": _parse_inline_marks(line)})
        i += 1

    return {"type": "doc", "content": content}


def content_for_storage(markdown_text):
    """Convert markdown to (tiptap_json_string, plain_text) for storage."""
    plain = markdown_text or ""
    if not plain.strip():
        return (None, None)
    tiptap = markdown_to_tiptap(plain)
    return (json.dumps(tiptap), plain)


# ── Module guards ─────────────────────────────────────────────────────

_workspace_modules_cache = None


def get_workspace_modules():
    global _workspace_modules_cache
    if _workspace_modules_cache is not None:
        return _workspace_modules_cache
    try:
        rows = api_get("workspace", {"select": "settings", "limit": "1"})
        if rows:
            settings = rows[0].get("settings") or {}
            _workspace_modules_cache = settings.get("modules", {"crm": True})
        else:
            _workspace_modules_cache = {"crm": True}
    except Exception:
        _workspace_modules_cache = {"crm": True}
    return _workspace_modules_cache


def require_crm():
    modules = get_workspace_modules()
    if not modules.get("crm", True):
        print(
            json.dumps(
                {
                    "error": "crm_disabled",
                    "message": "CRM module is not enabled in this workspace. Enable it in Settings > Modules.",
                }
            )
        )
        sys.exit(0)


# ── Output helper ──────────────────────────────────────────────────────


def output(data):
    print(json.dumps(data, indent=2, ensure_ascii=False))
