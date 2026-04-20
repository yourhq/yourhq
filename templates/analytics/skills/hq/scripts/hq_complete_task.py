#!/usr/bin/env python3
"""Mark a task as done."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_patch, audit, AGENT_SLUG, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_complete_task.py TASK_ID", file=sys.stderr)
    sys.exit(1)

task_id = sys.argv[1]
api_patch("tasks", task_id, {"status": "done"})
audit("tasks", "task", task_id, "status_changed",
      summary=f"Agent '{AGENT_SLUG}' completed task")
output({"status": "completed", "task_id": task_id})
