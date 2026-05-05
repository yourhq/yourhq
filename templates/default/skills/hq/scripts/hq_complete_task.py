#!/usr/bin/env python3
"""Mark a task as done and notify the workspace owner."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, api_patch, api_post, audit, check_env, get_agent_id, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_complete_task.py TASK_ID [summary]", file=sys.stderr)
    sys.exit(1)

task_id = sys.argv[1]
summary_msg = sys.argv[2] if len(sys.argv) > 2 else None

api_patch("tasks", task_id, {"status": "done"})
audit("tasks", "task", task_id, "status_changed", summary="Completed this task",
      changes={"status": {"old": "in_progress", "new": "done"}})

agent_id = get_agent_id()
task_rows = api_get("tasks", {"select": "title", "id": f"eq.{task_id}", "limit": "1"})
task_title = task_rows[0]["title"] if task_rows else "task"

comment_body = summary_msg or f"Done — completed \"{task_title}\"."
api_post("comments", {
    "entity_type": "task",
    "entity_id": task_id,
    "actor_type": "agent",
    "actor_agent_id": agent_id,
    "body": comment_body,
    "mentions": [],
})

output({"status": "completed", "task_id": task_id})
