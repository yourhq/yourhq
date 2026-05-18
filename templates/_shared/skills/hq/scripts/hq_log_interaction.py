#!/usr/bin/env python3
"""Log an interaction with a contact (replaces outreach_log)."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_post, audit, check_env, get_agent_id, now_iso, output, require_crm

check_env()
require_crm()

ap = argparse.ArgumentParser()
ap.add_argument("contact_id")
ap.add_argument(
    "--type", required=True, help="email, call, meeting, linkedin_message, dm, intro, coffee, event, note, other"
)
ap.add_argument("--direction", default=None, choices=["inbound", "outbound"])
ap.add_argument("--channel", default=None)
ap.add_argument("--summary", default=None)
ap.add_argument("--body", default=None)
ap.add_argument("--subject", default=None)
ap.add_argument("--next-action", default=None)
ap.add_argument("--next-action-days", type=int, default=None, help="Set next_action_date to N days from now")
ap.add_argument("--org-id", default=None)
ap.add_argument("--template-id", default=None)
args = ap.parse_args()

agent_id = get_agent_id()
payload = {
    "contact_id": args.contact_id,
    "type": args.type,
    "direction": args.direction,
    "channel": args.channel,
    "subject": args.subject,
    "summary": args.summary,
    "body": args.body,
    "next_action": args.next_action,
    "org_id": args.org_id,
    "template_id": args.template_id,
    "actor_type": "agent",
    "actor_agent_id": agent_id,
    "occurred_at": now_iso(),
}

if args.next_action_days:
    from datetime import timedelta

    from hq_base import datetime, timezone

    nad = datetime.now(timezone.utc) + timedelta(days=args.next_action_days)
    payload["next_action_date"] = nad.replace(microsecond=0).isoformat()

# Remove None values
payload = {k: v for k, v in payload.items() if v is not None}

result = api_post("interactions", payload)
row = result[0] if isinstance(result, list) else result

audit(
    "crm",
    "interaction",
    row["id"],
    "created",
    summary=f"Agent '{AGENT_SLUG}' logged {args.type} interaction with contact",
)

output({"status": "logged", "id": row["id"], "type": args.type, "contact_id": args.contact_id})
