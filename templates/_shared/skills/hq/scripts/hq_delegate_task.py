#!/usr/bin/env python3
"""Delegate a subtask to a direct report agent.

Usage:
  hq_delegate_task.py --task-id <uuid> --to-agent <slug> --title "Sub-task title" --instruction "..."
  hq_delegate_task.py --task-id <uuid> --to-agent <slug> --title "..." --priority high --due-date 2026-05-15
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_SLUG,
    api_get,
    api_post,
    audit,
    check_env,
    get_agent_id,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--task-id", required=True)
ap.add_argument("--to-agent", required=True, help="Slug of the target agent (must be a direct report)")
ap.add_argument("--title", required=True)
ap.add_argument("--instruction", default=None)
ap.add_argument("--priority", default="medium", choices=["urgent", "high", "medium", "low"])
ap.add_argument("--due-date", default=None)
args = ap.parse_args()

agent_id = get_agent_id()

# Validate target agent is a direct report
target_agents = api_get(
    "agents",
    {
        "select": "id,slug,name,reports_to_id",
        "slug": f"eq.{args.to_agent}",
        "limit": "1",
    },
)

if not target_agents:
    output({"error": "agent_not_found", "agent_slug": args.to_agent})
    sys.exit(1)

target = target_agents[0]
if target.get("reports_to_id") != agent_id:
    output(
        {
            "error": "not_a_report",
            "message": f"{args.to_agent} does not report to {AGENT_SLUG}. Delegation requires a direct report relationship.",
            "agent_slug": args.to_agent,
        }
    )
    sys.exit(1)

# Get the parent task's stream for inheritance
parent_tasks = api_get(
    "tasks",
    {
        "select": "stream_id",
        "id": f"eq.{args.task_id}",
        "limit": "1",
    },
)
stream_id = parent_tasks[0].get("stream_id") if parent_tasks else None

# Create the subtask
task_payload = {
    "title": args.title,
    "description": args.instruction,
    "status": "todo",
    "priority": args.priority,
    "parent_id": args.task_id,
    "stream_id": stream_id,
    "assignee_type": "agent",
    "assignee_agent_id": target["id"],
    "due_date": args.due_date,
}

result = api_post("tasks", task_payload)
new_task = result[0] if isinstance(result, list) else result
new_task_id = new_task["id"]

# Create child_of relation
api_post(
    "task_relations",
    {
        "source_task_id": new_task_id,
        "target_task_id": args.task_id,
        "relation_type": "child_of",
        "created_by_type": "agent",
        "created_by_agent_id": agent_id,
    },
)

audit(
    "tasks", "task", new_task_id, "created", summary=f"Agent '{AGENT_SLUG}' delegated '{args.title}' to {args.to_agent}"
)

output(
    {
        "status": "delegated",
        "task_id": new_task_id,
        "parent_task_id": args.task_id,
        "delegated_to": args.to_agent,
        "title": args.title,
        "priority": args.priority,
    }
)
