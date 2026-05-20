#!/usr/bin/env python3
"""List tasks with flexible filters."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, get_agent_id, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--status", default=None, help="Comma-separated statuses (e.g. todo,in_progress)")
ap.add_argument("--stream-id", default=None, help="Filter by stream UUID")
ap.add_argument("--assignee-type", choices=["human", "agent", "system", "unassigned"], default=None)
ap.add_argument("--agent-id", default=None, help="Filter by agent UUID")
ap.add_argument("--mine", action="store_true", help="Shortcut for tasks assigned to the current agent")
ap.add_argument("--tag", action="append", default=None, help="Filter by tag; can be passed multiple times")
ap.add_argument("--limit", type=int, default=100)
args = ap.parse_args()

if args.mine and args.agent_id:
    print("Usage error: --mine and --agent-id cannot be combined", file=sys.stderr)
    sys.exit(1)

params = {
    "select": "id,title,description,status,priority,due_date,completed_at,stream_id,tags,created_at,updated_at,assignee_type,assignee_agent_id,parent_id,linked_entity_type,linked_entity_id",
    "order": "priority.asc,created_at.asc",
    "limit": str(args.limit),
}

if args.status:
    statuses = [s.strip() for s in args.status.split(",") if s.strip()]
    if statuses:
        params["status"] = f"in.({','.join(statuses)})"

if args.stream_id:
    params["stream_id"] = f"eq.{args.stream_id}"

if args.mine:
    agent_id = get_agent_id()
    if not agent_id:
        output({"error": "agent_not_registered"})
        sys.exit(1)
    params["assignee_type"] = "eq.agent"
    params["assignee_agent_id"] = f"eq.{agent_id}"
elif args.agent_id:
    params["assignee_type"] = "eq.agent"
    params["assignee_agent_id"] = f"eq.{args.agent_id}"
elif args.assignee_type:
    if args.assignee_type == "unassigned":
        params["assignee_type"] = "is.null"
    else:
        params["assignee_type"] = f"eq.{args.assignee_type}"

if args.tag:
    tags = [t.strip() for t in args.tag if t and t.strip()]
    if tags:
        params["tags"] = f"cs.{{{','.join(tags)}}}"

rows = api_get("tasks", params)
output(
    {
        "count": len(rows),
        "filters": {
            "status": args.status,
            "stream_id": args.stream_id,
            "assignee_type": args.assignee_type,
            "agent_id": args.agent_id,
            "mine": args.mine,
            "tags": args.tag or [],
            "limit": args.limit,
        },
        "tasks": rows,
    }
)
