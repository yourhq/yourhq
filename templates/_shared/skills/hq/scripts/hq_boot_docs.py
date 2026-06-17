#!/usr/bin/env python3
"""Fetch boot knowledge: workspace-scoped items (full) + agent-scoped items (index)."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, get_agent_id, output

check_env()

agent_id = get_agent_id()

workspace_items = (
    api_get(
        "knowledge_items",
        {
            "select": "id,title,kind,content,plain_text,tags,scope,folder_id,updated_at",
            "scope": "eq.workspace",
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
                    "select": "id,title,kind,content,plain_text,tags,scope,folder_id,updated_at",
                    "id": f"in.({','.join(item_ids)})",
                    "archived_at": "is.null",
                },
            )
            or []
        )

seen = set()
items = []
for item in workspace_items + agent_items:
    if item["id"] not in seen:
        seen.add(item["id"])
        items.append(item)

output(
    {
        "boot_item_count": len(items),
        "items": items,
    }
)
