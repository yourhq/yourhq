#!/usr/bin/env python3
"""Link a knowledge item or URL to a task via entity_links."""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_post, audit, AGENT_SLUG, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("task_id")
ap.add_argument("--type", required=True, choices=["knowledge_item", "url", "contact", "organization", "collection_record"])
ap.add_argument("--entity-id", default=None)
ap.add_argument("--url", default=None)
ap.add_argument("--label", default=None)
args = ap.parse_args()

payload = {
    "owner_type": "task",
    "owner_id": args.task_id,
    "target_type": args.type,
    "target_id": args.entity_id,
    "url": args.url if args.type == "url" else None,
    "label": args.label,
}

result = api_post("entity_links", payload)
link = result[0] if isinstance(result, list) else result

audit("tasks", "entity_link", link["id"], "created",
      summary=f"Agent '{AGENT_SLUG}' linked {args.type} to task")

output({"status": "linked", "link_id": link["id"], "task_id": args.task_id, "type": args.type})
