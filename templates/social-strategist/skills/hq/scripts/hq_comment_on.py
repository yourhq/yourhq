#!/usr/bin/env python3
"""Post a comment on any entity (task, contact, organization, etc.)."""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_post, audit, check_env, get_agent_id, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("entity_type", help="task, contact, organization, asset, document")
ap.add_argument("entity_id")
ap.add_argument("body")
ap.add_argument("--parent-id", default=None)
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

mentions = list(set(re.findall(r"@[\w-]+", args.body)))
result = api_post(
    "comments",
    {
        "entity_type": args.entity_type,
        "entity_id": args.entity_id,
        "parent_id": args.parent_id,
        "actor_type": "agent",
        "actor_agent_id": agent_id,
        "body": args.body,
        "mentions": mentions,
    },
)
comment = result[0] if isinstance(result, list) else result
audit(
    args.entity_type + "s",
    "comment",
    comment["id"],
    "created",
    summary=f"Agent '{AGENT_SLUG}' commented on {args.entity_type}",
)
output(
    {
        "status": "posted",
        "comment_id": comment["id"],
        "entity_type": args.entity_type,
        "entity_id": args.entity_id,
        "mentions": mentions,
    }
)
