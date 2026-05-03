#!/usr/bin/env python3
"""
Agent Inbox Processor

Called by the agent's background inbox session when woken by the dispatcher.
Processes inbox items sequentially using lease-based concurrency control.

Flow:
  1. Lease the next pending item (via Postgres function)
  2. Fetch full task/comment context
  3. Output the item for the agent to handle
  4. Agent handles it (external to this script)
  5. Agent calls hq_inbox_done.py or hq_inbox_fail.py to mark the item

Usage:
  python3 skills/hq/scripts/hq_inbox_process.py
  python3 skills/hq/scripts/hq_inbox_process.py --batch 3
  python3 skills/hq/scripts/hq_inbox_process.py --status
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_get, api_rpc, check_env, get_agent_id, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--batch", type=int, default=1, help="Number of items to lease (max 3)")
ap.add_argument("--status", action="store_true", help="Show inbox status without leasing")
ap.add_argument("--lease-seconds", type=int, default=120, help="Lease duration in seconds")
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

# Status mode — just show inbox counts
if args.status:
    pending = api_get("agent_inbox_items", {
        "select": "id,event_type,summary,created_at,status,attempt_count",
        "agent_id": f"eq.{agent_id}",
        "status": "in.(pending,failed,leased)",
        "order": "created_at.asc",
    })

    by_status = {}
    for item in pending:
        s = item["status"]
        by_status[s] = by_status.get(s, 0) + 1

    output({
        "agent": AGENT_SLUG,
        "actionable_count": len(pending),
        "by_status": by_status,
        "items": [
            {
                "id": i["id"],
                "event_type": i["event_type"],
                "summary": i["summary"],
                "status": i["status"],
                "attempts": i["attempt_count"],
                "created_at": i["created_at"],
            }
            for i in pending
        ],
    })
    sys.exit(0)

# Process mode — lease and output items for the agent to handle
batch_size = min(args.batch, 3)  # Cap at 3 per the design
items = []

for _ in range(batch_size):
    try:
        result = api_rpc("lease_inbox_item", {
            "p_agent_id": agent_id,
            "p_lease_seconds": args.lease_seconds,
        })
        if result and len(result) > 0:
            item = result[0]
            # Fetch full context based on event type
            context = dict(item.get("context", {}))

            if item.get("task_id"):
                tasks = api_get("tasks", {
                    "select": "id,title,description,status,priority,tags,due_date,stream_id,meta",
                    "id": f"eq.{item['task_id']}",
                    "limit": "1",
                })
                if tasks:
                    context["task"] = tasks[0]

                # Fetch linked entities
                links = api_get("entity_links", {
                    "select": "id,target_type,target_id,url,label",
                    "owner_type": "eq.task",
                    "owner_id": f"eq.{item['task_id']}",
                })
                if links:
                    context["links"] = links

            if item.get("comment_id"):
                comments = api_get("comments", {
                    "select": "id,body,actor_type,actor_agent_id,mentions,created_at",
                    "id": f"eq.{item['comment_id']}",
                    "limit": "1",
                })
                if comments:
                    context["comment"] = comments[0]

            if item.get("contact_id"):
                contacts = api_get("contacts", {
                    "select": "id,name,handle,status,email,phone,company,title,tags,extended,relationship_strength,last_contact_date",
                    "id": f"eq.{item['contact_id']}",
                    "limit": "1",
                })
                if contacts:
                    context["contact"] = contacts[0]

            items.append({
                "inbox_item_id": item["id"],
                "event_type": item["event_type"],
                "summary": item["summary"],
                "task_id": item.get("task_id"),
                "comment_id": item.get("comment_id"),
                "contact_id": item.get("contact_id"),
                "attempt": item["attempt_count"],
                "leased_until": item.get("leased_until"),
                "context": context,
            })
        else:
            break  # No more items
    except Exception:
        # If leasing fails, stop trying
        break

if not items:
    output({"agent": AGENT_SLUG, "inbox": "empty", "message": "No actionable items in inbox."})
    sys.exit(0)

output({
    "agent": AGENT_SLUG,
    "leased_count": len(items),
    "items": items,
    "instructions": (
        "Process each item, then mark it:\n"
        "  Done:  python3 skills/hq/scripts/hq_inbox_done.py INBOX_ITEM_ID\n"
        "  Failed: python3 skills/hq/scripts/hq_inbox_fail.py INBOX_ITEM_ID \"reason\"\n"
        "  Escalate: python3 skills/hq/scripts/hq_escalate.py TASK_ID \"reason\""
    ),
})
