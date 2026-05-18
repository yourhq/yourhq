#!/usr/bin/env python3
"""
HQ Queue Processor

Lists all tasks assigned to this agent in 'todo' status,
ordered by priority then creation date. Outputs them as a
structured work queue for the agent to process sequentially.

The agent should:
1. Run this to see what's queued
2. Claim the first task
3. Process it (read attachments, do the work, update status)
4. If stuck, escalate (blocked + comment + channel notification)
5. Run this again to get the next task
6. Repeat until the queue is empty

Usage:
  python3 skills/hq/scripts/hq_process_queue.py
  python3 skills/hq/scripts/hq_process_queue.py --include-blocked
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_get, check_env, get_agent_id, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--include-blocked", action="store_true", help="Include blocked tasks in the queue")
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

statuses = ["todo"]
if args.include_blocked:
    statuses.append("blocked")

# Also check in_progress in case agent was interrupted mid-task
statuses.append("in_progress")

params = {
    "select": "id,title,description,status,priority,due_date,stream_id,tags,created_at,meta",
    "assignee_agent_id": f"eq.{agent_id}",
    "status": f"in.({','.join(statuses)})",
    "order": "priority.asc,created_at.asc",
}

tasks = api_get("tasks", params)

# Separate by status for clear queue ordering
in_progress = [t for t in tasks if t["status"] == "in_progress"]
todo = [t for t in tasks if t["status"] == "todo"]
blocked = [t for t in tasks if t["status"] == "blocked"]

queue = in_progress + todo  # in_progress first (resume interrupted work)

output(
    {
        "agent": AGENT_SLUG,
        "queue_depth": len(queue),
        "in_progress": len(in_progress),
        "todo": len(todo),
        "blocked": len(blocked),
        "queue": [
            {
                "position": i + 1,
                "id": t["id"],
                "title": t["title"],
                "status": t["status"],
                "priority": t["priority"],
                "description": (t.get("description") or "")[:200],
                "tags": t.get("tags", []),
            }
            for i, t in enumerate(queue)
        ],
        "blocked_tasks": [{"id": t["id"], "title": t["title"]} for t in blocked] if blocked else [],
    }
)
