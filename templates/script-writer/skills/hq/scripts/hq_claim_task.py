#!/usr/bin/env python3
"""Claim a task and fetch its attachments."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, api_patch, audit, get_agent_id, AGENT_SLUG, now_iso, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_claim_task.py TASK_ID", file=sys.stderr)
    sys.exit(1)

task_id = sys.argv[1]
agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

# Claim
result = api_patch("tasks", task_id, {
    "status": "in_progress",
    "assignee_type": "agent",
    "assignee_agent_id": agent_id,
})

audit("tasks", "task", task_id, "assigned",
      summary=f"Agent '{AGENT_SLUG}' claimed task")

# Fetch attachments
attachments = api_get("task_attachments", {
    "select": "id,entity_type,entity_id,url,label",
    "task_id": f"eq.{task_id}",
})

# Resolve documents and assets
resolved = []
for att in attachments:
    entry = dict(att)
    if att["entity_type"] == "document" and att.get("entity_id"):
        docs = api_get("documents", {
            "select": "id,title,content,tags",
            "id": f"eq.{att['entity_id']}",
            "limit": "1",
        })
        entry["document"] = docs[0] if docs else None
    elif att["entity_type"] == "asset" and att.get("entity_id"):
        assets = api_get("assets", {
            "select": "id,name,type,content,file_url",
            "id": f"eq.{att['entity_id']}",
            "limit": "1",
        })
        entry["asset"] = assets[0] if assets else None
    resolved.append(entry)

task = result[0] if isinstance(result, list) else result
output({
    "status": "claimed",
    "task_id": task_id,
    "task_title": task.get("title"),
    "attachment_count": len(resolved),
    "attachments": resolved,
})
