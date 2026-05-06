#!/usr/bin/env python3
"""Assign a task to an agent or mark it as human-assigned."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_patch, audit, check_env, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("task_id")
group = ap.add_mutually_exclusive_group(required=True)
group.add_argument("--agent-id", help="Assign to an agent UUID")
group.add_argument("--human", action="store_true", help="Mark the task as assigned to a human")
ap.add_argument("--status", default=None, help="Optional status to set alongside assignment")
args = ap.parse_args()

payload = {}
summary_target = None

if args.agent_id:
    payload.update(
        {
            "assignee_type": "agent",
            "assignee_agent_id": args.agent_id,
        }
    )
    summary_target = f"agent {args.agent_id}"
elif args.human:
    payload.update(
        {
            "assignee_type": "human",
            "assignee_agent_id": None,
        }
    )
    summary_target = "human"

if args.status:
    payload["status"] = args.status

api_patch("tasks", args.task_id, payload)

audit(
    "tasks",
    "task",
    args.task_id,
    "assigned",
    summary=f"Agent '{AGENT_SLUG}' assigned task to {summary_target}",
    changes=payload,
)

output({"status": "assigned", "task_id": args.task_id, "assignment": payload})
