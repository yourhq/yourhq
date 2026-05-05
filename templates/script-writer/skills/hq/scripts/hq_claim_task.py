#!/usr/bin/env python3
"""Claim a task and fetch linked entities plus relevant knowledge chunks."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, api_patch, api_rpc, audit, check_env, get_agent_id, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_claim_task.py TASK_ID", file=sys.stderr)
    sys.exit(1)

task_id = sys.argv[1]
agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

result = api_patch("tasks", task_id, {
    "status": "in_progress",
    "assignee_type": "agent",
    "assignee_agent_id": agent_id,
})

audit("tasks", "task", task_id, "assigned", summary="Claimed this task")
audit("tasks", "task", task_id, "status_changed", summary="Started working on this task",
      changes={"status": {"old": "todo", "new": "in_progress"}})

links = api_get("entity_links", {
    "select": "id,target_type,target_id,url,label,meta",
    "owner_type": "eq.task",
    "owner_id": f"eq.{task_id}",
})

task = result[0] if isinstance(result, list) else result
task_context_query = " ".join(
    part for part in [
        str(task.get("title") or "").strip(),
        str(task.get("description") or "").strip(),
    ] if part
)


def resolve_knowledge_item(item_id):
    items = api_get("knowledge_items", {
        "select": "id,title,kind,content,plain_text,tags,scope,folder_id,updated_at,chunk_status,chunk_count",
        "id": f"eq.{item_id}",
        "limit": "1",
    })
    item = items[0] if items else None
    if not item:
        return {"knowledge_item": None, "relevant_chunks": []}

    chunks = []
    if item.get("chunk_count", 0) > 0:
        query = task_context_query or str(item.get("title") or "").strip()
        if query:
            try:
                chunks = api_rpc("search_knowledge_chunks_text", {
                    "query_text": query,
                    "match_count": 5,
                    "filter_tags": None,
                    "filter_folder_id": None,
                    "filter_source_type": None,
                    "filter_source_id": None,
                }) or []
                chunks = [c for c in chunks if c.get("knowledge_item_id") == item_id][:5]
            except Exception:
                pass

    return {
        "knowledge_item": item,
        "relevant_chunks": chunks,
        "content_access": "Use hq_get_doc.py ITEM_ID for full content or hq_get_knowledge_chunks.py ITEM_ID for indexed sections.",
    }


resolved = []
for link in (links or []):
    entry = {
        "link_id": link["id"],
        "target_type": link["target_type"],
        "target_id": link.get("target_id"),
        "url": link.get("url"),
        "label": link.get("label"),
    }

    if link["target_type"] == "knowledge_item" and link.get("target_id"):
        entry.update(resolve_knowledge_item(link["target_id"]))
    elif link["target_type"] == "contact" and link.get("target_id"):
        contacts = api_get("contacts", {
            "select": "id,first_name,last_name,email,company,status",
            "id": f"eq.{link['target_id']}",
            "limit": "1",
        })
        entry["contact"] = contacts[0] if contacts else None
    elif link["target_type"] == "organization" and link.get("target_id"):
        orgs = api_get("organizations", {
            "select": "id,name,domain,industry",
            "id": f"eq.{link['target_id']}",
            "limit": "1",
        })
        entry["organization"] = orgs[0] if orgs else None
    elif link["target_type"] == "collection_record" and link.get("target_id"):
        records = api_get("collection_records", {
            "select": "id,collection_id,values",
            "id": f"eq.{link['target_id']}",
            "limit": "1",
        })
        entry["collection_record"] = records[0] if records else None

    resolved.append(entry)

output({
    "status": "claimed",
    "task_id": task_id,
    "task_title": task.get("title"),
    "link_count": len(resolved),
    "links": resolved,
})
