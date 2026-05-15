#!/usr/bin/env python3
"""Session-scoped HQ bootstrap.

Registers the current agent and fetches boot knowledge once for a session,
writing a local cache artifact for prompt injection hooks.
"""

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
HQ_SCRIPTS_DIR = SCRIPT_DIR.parent / "skills" / "hq" / "scripts"
sys.path.insert(0, str(HQ_SCRIPTS_DIR))

from hq_base import AGENT_SLUG, api_get, api_patch, api_post, check_env, now_iso  # type: ignore

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


def fetch_boot_knowledge() -> list:
    """Fetch knowledge items for agent boot context.

    Workspace-scoped pinned items (available to all agents) plus
    agent-scoped items linked to this agent via the junction table.
    """
    agent_id = None
    agents = api_get("agents", {"select": "id", "slug": f"eq.{AGENT_SLUG}", "limit": "1"})
    if agents:
        agent_id = agents[0]["id"]

    item_select = "id,title,kind,content,plain_text,tags,scope,folder_id,updated_at,meta,source_connection_id"

    workspace_items = (
        api_get(
            "knowledge_items",
            {
                "select": item_select,
                "scope": "eq.workspace",
                "pinned": "eq.true",
                "archived_at": "is.null",
            },
        )
        or []
    )

    agent_items = []
    if agent_id:
        junctions = (
            api_get(
                "knowledge_item_agents",
                {
                    "select": "knowledge_item_id",
                    "agent_id": f"eq.{agent_id}",
                },
            )
            or []
        )
        item_ids = [j["knowledge_item_id"] for j in junctions]
        if item_ids:
            agent_items = (
                api_get(
                    "knowledge_items",
                    {
                        "select": item_select,
                        "id": f"in.({','.join(item_ids)})",
                        "archived_at": "is.null",
                    },
                )
                or []
            )

    seen = set()
    items = []
    for item in workspace_items + agent_items:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        entry = {
            "id": item.get("id"),
            "title": item.get("title") or "Untitled",
            "kind": item.get("kind") or "page",
            "tags": item.get("tags") or [],
            "scope": item.get("scope") or "workspace",
            "updatedAt": item.get("updated_at"),
            "content": item.get("plain_text") or item.get("content") or "",
            "folderId": item.get("folder_id"),
        }
        meta = item.get("meta") or {}
        if isinstance(meta, dict) and meta.get("provider"):
            entry["provider"] = meta["provider"]
        items.append(entry)
    return items


def fetch_connected_sources() -> list:
    """Fetch active source connections for the workspace summary."""
    connections = (
        api_get(
            "source_connections",
            {
                "select": "id,provider,account_label,writable,status",
                "status": "eq.active",
                "order": "provider.asc",
            },
        )
        or []
    )
    results = []
    for conn in connections:
        item_count = len(
            api_get(
                "knowledge_items",
                {
                    "select": "id",
                    "source_connection_id": f"eq.{conn['id']}",
                    "archived_at": "is.null",
                },
            )
            or []
        )
        results.append(
            {
                "provider": conn["provider"],
                "accountLabel": conn["account_label"],
                "writable": conn.get("writable", False),
                "itemCount": item_count,
            }
        )
    return results


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
        knowledge = fetch_boot_knowledge()
        sources = fetch_connected_sources()
        payload = {
            "status": "done",
            "sessionId": args.session_id,
            "sessionKey": args.session_key,
            "agentSlug": AGENT_SLUG,
            "agentId": registered.get("agent_id"),
            "registrationAction": registered.get("action"),
            "registeredAt": now_iso(),
            "fetchedAt": now_iso(),
            "knowledge": knowledge,
            "knowledgeCount": len(knowledge),
            "connectedSources": sources,
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
