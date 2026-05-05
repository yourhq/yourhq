#!/usr/bin/env python3
"""Mark a task as done."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_patch, audit, check_env, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_complete_task.py TASK_ID", file=sys.stderr)
    sys.exit(1)

task_id = sys.argv[1]
api_patch("tasks", task_id, {"status": "done"})
audit("tasks", "task", task_id, "status_changed", summary="Completed this task",
      changes={"status": {"old": "in_progress", "new": "done"}})
output({"status": "completed", "task_id": task_id})
