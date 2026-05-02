#!/usr/bin/env python3
"""Fetch boot knowledge: workspace pinned items + agent-scoped items."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, get_agent_id, AGENT_SLUG, output

check_env()

agent_id = get_agent_id()

workspace_items = api_get("knowledge_items", {
    "select": "id,title,kind,content,plain_text,tags,scope,folder_id,updated_at",
    "scope": "eq.workspace",
    "pinned": "eq.true",
    "archived_at": "is.null",
}) or []

agent_items = []
if agent_id:
    junctions = api_get("knowledge_item_agents", {
        "select": "knowledge_item_id",
        "agent_id": f"eq.{agent_id}",
    }) or []
    item_ids = [j["knowledge_item_id"] for j in junctions]
    if item_ids:
        agent_items = api_get("knowledge_items", {
            "select": "id,title,kind,content,plain_text,tags,scope,folder_id,updated_at",
            "id": f"in.({','.join(item_ids)})",
            "archived_at": "is.null",
        }) or []

seen = set()
items = []
for item in workspace_items + agent_items:
    if item["id"] not in seen:
        seen.add(item["id"])
        items.append(item)

output({
    "boot_item_count": len(items),
    "items": items,
})
