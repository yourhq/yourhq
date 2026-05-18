#!/usr/bin/env python3
"""List tasks assigned to a human."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--status", default=None, help="Comma-separated statuses (e.g. todo,in_progress)")
args = ap.parse_args()

params = {
    "select": "id,title,description,status,priority,due_date,stream_id,tags,created_at,updated_at,assignee_type,assignee_agent_id",
    "assignee_type": "eq.human",
    "order": "priority.asc,created_at.asc",
}
if args.status:
    statuses = args.status.split(",")
    params["status"] = f"in.({','.join(statuses)})"

rows = api_get("tasks", params)
output({"count": len(rows), "tasks": rows})
