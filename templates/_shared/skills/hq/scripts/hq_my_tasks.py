#!/usr/bin/env python3
"""List tasks assigned to this agent."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, get_agent_id, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--status", default=None, help="Comma-separated statuses (e.g. todo,in_progress)")
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

params = {
    "select": "id,title,description,status,priority,due_date,stream_id,tags,created_at,updated_at",
    "assignee_agent_id": f"eq.{agent_id}",
    "order": "priority.asc,created_at.asc",
}
if args.status:
    statuses = args.status.split(",")
    params["status"] = f"in.({','.join(statuses)})"

rows = api_get("tasks", params)
output({"agent_id": agent_id, "count": len(rows), "tasks": rows})
