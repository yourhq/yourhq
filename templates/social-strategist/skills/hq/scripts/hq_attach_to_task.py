#!/usr/bin/env python3
"""Attach a document, asset, or URL to a task."""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_post, audit, AGENT_SLUG, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("task_id")
ap.add_argument("--type", required=True, choices=["document", "asset", "url"])
ap.add_argument("--entity-id", default=None)
ap.add_argument("--url", default=None)
ap.add_argument("--label", default=None)
args = ap.parse_args()

payload = {
    "task_id": args.task_id,
    "entity_type": args.type,
    "entity_id": args.entity_id,
    "url": args.url,
    "label": args.label,
}

result = api_post("task_attachments", payload)
att = result[0] if isinstance(result, list) else result

audit("tasks", "task_attachment", att["id"], "created",
      summary=f"Agent '{AGENT_SLUG}' attached {args.type} to task")

output({"status": "attached", "attachment_id": att["id"], "task_id": args.task_id, "type": args.type})
