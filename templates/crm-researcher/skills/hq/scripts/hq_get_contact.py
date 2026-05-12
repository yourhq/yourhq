#!/usr/bin/env python3
"""Get a single contact by ID with full details, organizations, and recent interactions."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, require_crm, output

check_env()
require_crm()

ap = argparse.ArgumentParser()
ap.add_argument("id", help="Contact UUID")
ap.add_argument("--include-interactions", action="store_true", help="Include recent interactions")
ap.add_argument("--include-organizations", action="store_true", help="Include linked organizations")
ap.add_argument("--interaction-limit", type=int, default=10)
args = ap.parse_args()

rows = api_get("contacts", {
    "select": "*",
    "id": f"eq.{args.id}",
    "limit": "1",
})

if not rows:
    output({"error": "not_found", "message": f"Contact {args.id} not found"})
    sys.exit(0)

contact = rows[0]
result = {"contact": contact}

if args.include_organizations:
    orgs = api_get("contact_organizations", {
        "select": "id,org_id,role,is_current,started_at,ended_at",
        "contact_id": f"eq.{args.id}",
        "order": "is_current.desc,created_at.desc",
    })
    org_ids = [o["org_id"] for o in (orgs or [])]
    org_details = {}
    if org_ids:
        org_rows = api_get("organizations", {
            "select": "id,name,type,website,industry,location",
            "id": f"in.({','.join(org_ids)})",
        })
        org_details = {o["id"]: o for o in (org_rows or [])}
    result["organizations"] = [
        {**o, "organization": org_details.get(o["org_id"])}
        for o in (orgs or [])
    ]

if args.include_interactions:
    interactions = api_get("interactions", {
        "select": "id,type,direction,channel,subject,summary,occurred_at,next_action,next_action_date,actor_type",
        "contact_id": f"eq.{args.id}",
        "order": "occurred_at.desc",
        "limit": str(args.interaction_limit),
    })
    result["interactions"] = interactions or []

output(result)
