#!/usr/bin/env python3
"""Fetch boot knowledge items tagged boot:all and boot:AGENT_SLUG."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, AGENT_SLUG, output

check_env()

items_all = api_get("knowledge_items", {
    "select": "id,title,kind,content,plain_text,tags,folder_id",
    "tags": f"cs.{{boot:all}}",
    "archived_at": "is.null",
})

items_agent = api_get("knowledge_items", {
    "select": "id,title,kind,content,plain_text,tags,folder_id",
    "tags": f"cs.{{boot:{AGENT_SLUG}}}",
    "archived_at": "is.null",
})

seen = set()
items = []
for item in items_all + items_agent:
    if item["id"] not in seen:
        seen.add(item["id"])
        items.append(item)

output({
    "boot_item_count": len(items),
    "items": items,
})
