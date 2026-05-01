#!/usr/bin/env python3
"""Session-scoped HQ bootstrap.

Registers the current agent and fetches boot documents once for a session,
writing a local cache artifact for prompt injection hooks.
"""

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
HQ_SCRIPTS_DIR = SCRIPT_DIR.parent / "skills" / "hq" / "scripts"
sys.path.insert(0, str(HQ_SCRIPTS_DIR))

from hq_base import check_env, api_get, api_post, api_patch, AGENT_SLUG, now_iso  # type: ignore

MAX_RETRIES = 3


def workspace_root() -> Path:
    return SCRIPT_DIR.parent


def state_path(session_id: str) -> Path:
    return workspace_root() / "state" / "session-bootstrap" / f"{session_id}.json"


def load_existing_state(session_id: str) -> dict:
    """Load existing state file if present, for retry tracking."""
    p = state_path(session_id)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def load_agent_meta() -> dict:
    candidate = workspace_root() / "agent.json"
    if candidate.exists():
        return json.loads(candidate.read_text())
    return {}


def register_agent() -> dict:
    agent_meta = load_agent_meta()
    existing = api_get("agents", {"select": "id", "slug": f"eq.{AGENT_SLUG}", "limit": "1"})
    payload = {
        "slug": AGENT_SLUG,
        "name": agent_meta.get("name", AGENT_SLUG),
        "description": agent_meta.get("description"),
        "domains": agent_meta.get("domains", []),
        "capabilities": agent_meta.get("capabilities", []),
        "status": "ready",
        "last_seen_at": now_iso(),
    }
    if existing:
        api_patch("agents", existing[0]["id"], payload)
        return {"action": "updated", "agent_id": existing[0]["id"]}
    result = api_post("agents", payload)
    agent_id = result[0]["id"] if isinstance(result, list) else result.get("id")
    return {"action": "created", "agent_id": agent_id}


def fetch_boot_docs() -> list:
    docs_all = api_get("documents", {
        "select": "id,title,content,tags,folder_id,updated_at",
        "tags": "cs.{boot:all}",
    })
    docs_agent = api_get("documents", {
        "select": "id,title,content,tags,folder_id,updated_at",
        "tags": f"cs.{{boot:{AGENT_SLUG}}}",
    })
    seen = set()
    docs = []
    for d in (docs_all or []) + (docs_agent or []):
        if d["id"] in seen:
            continue
        seen.add(d["id"])
        docs.append({
            "id": d.get("id"),
            "title": d.get("title") or "Untitled",
            "tags": d.get("tags") or [],
            "updatedAt": d.get("updated_at"),
            "content": d.get("content") or "",
            "folderId": d.get("folder_id"),
        })
    return docs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--session-key", default="")
    args = parser.parse_args()

    out = state_path(args.session_id)
    out.parent.mkdir(parents=True, exist_ok=True)

    # Check retry count from existing state
    existing = load_existing_state(args.session_id)
    retries = existing.get("retries", 0)

    # Already done — nothing to do
    if existing.get("status") == "done":
        print(json.dumps(existing, indent=2, ensure_ascii=False))
        return 0

    # Exceeded retry cap
    if retries >= MAX_RETRIES:
        print(f"Max retries ({MAX_RETRIES}) exceeded, giving up", file=sys.stderr)
        return 1

    try:
        check_env()
        registered = register_agent()
        docs = fetch_boot_docs()
        payload = {
            "status": "done",
            "sessionId": args.session_id,
            "sessionKey": args.session_key,
            "agentSlug": AGENT_SLUG,
            "agentId": registered.get("agent_id"),
            "registrationAction": registered.get("action"),
            "registeredAt": now_iso(),
            "fetchedAt": now_iso(),
            "documents": docs,
            "documentCount": len(docs),
            "retries": retries,
        }
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0
    except Exception as e:
        retries += 1
        payload = {
            "status": "error",
            "sessionId": args.session_id,
            "sessionKey": args.session_key,
            "agentSlug": AGENT_SLUG,
            "error": str(e),
            "retries": retries,
            "lastAttemptAt": now_iso(),
        }
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps(payload, indent=2, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
