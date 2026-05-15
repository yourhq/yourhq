#!/usr/bin/env python3
"""
Escalate a task: set to blocked, post a comment, and notify the human via their configured channel.

Usage:
  python3 skills/hq/scripts/hq_escalate.py TASK_ID "Reason for escalation"
  python3 skills/hq/scripts/hq_escalate.py TASK_ID "Need approval for X" --notify-agent-id main
"""

import argparse
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_CHANNEL,
    AGENT_SLUG,
    api_get,
    api_patch,
    api_post,
    audit,
    check_env,
    get_agent_id,
    get_owner_handle,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("task_id")
ap.add_argument("reason")
ap.add_argument(
    "--notify-agent-id", default="main", help="OpenClaw agent ID to send notification through (default: main)"
)
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

# 1. Set task to blocked
api_patch("tasks", args.task_id, {"status": "blocked"})
audit("tasks", "task", args.task_id, "status_changed", summary=f"Agent '{AGENT_SLUG}' blocked task: {args.reason}")

# 2. Post comment with @mention
task_rows = api_get("tasks", {"select": "title", "id": f"eq.{args.task_id}", "limit": "1"})
task_title = task_rows[0]["title"] if task_rows else "Unknown"

owner = get_owner_handle()
comment_body = f"@{owner} Task blocked. Reason: {args.reason}"
api_post(
    "comments",
    {
        "entity_type": "task",
        "entity_id": args.task_id,
        "actor_type": "agent",
        "actor_agent_id": agent_id,
        "body": comment_body,
        "mentions": [owner],
    },
)

# 3. Notify via configured channel
notify_msg = (
    f"🚫 Task blocked by {AGENT_SLUG}\n\n"
    f"Task: {task_title}\n"
    f"Reason: {args.reason}\n"
    f"Task ID: {args.task_id}\n\n"
    f"Respond in the HQ or reply here."
)

notified = False
if AGENT_CHANNEL != "none":
    try:
        result = subprocess.run(
            [
                "openclaw",
                "agent",
                "--agent",
                args.notify_agent_id,
                "--message",
                notify_msg,
                "--deliver",
                "--reply-channel",
                AGENT_CHANNEL,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        notified = result.returncode == 0
    except Exception:
        notified = False

output(
    {
        "status": "escalated",
        "task_id": args.task_id,
        "task_title": task_title,
        "reason": args.reason,
        "blocked": True,
        "comment_posted": True,
        "notified": notified,
        "channel": AGENT_CHANNEL,
    }
)
