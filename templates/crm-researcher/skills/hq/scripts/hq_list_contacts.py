#!/usr/bin/env python3
"""List contacts with flexible filters."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, output, require_crm

check_env()
require_crm()

ap = argparse.ArgumentParser()
ap.add_argument("--status", default=None, help="Filter by pipeline status (e.g. lead,qualified)")
ap.add_argument("--priority", default=None, help="Filter by priority (urgent,high,medium,low)")
ap.add_argument(
    "--relationship", default=None, help="Filter by relationship strength (stranger,acquaintance,warm,strong)"
)
ap.add_argument("--tag", action="append", default=None, help="Filter by tag; can be passed multiple times")
ap.add_argument("--company", default=None, help="Filter contacts by company name (partial match)")
ap.add_argument("--search", default=None, help="Search by name or email (partial match)")
ap.add_argument("--campaign-id", default=None, help="Filter by campaign UUID")
ap.add_argument("--include-archived", action="store_true", help="Include archived contacts")
ap.add_argument("--limit", type=int, default=50)
args = ap.parse_args()

params = {
    "select": "id,name,email,phone,company,title,location,status,priority,relationship_strength,tags,last_contact_date,source,campaign_id,created_at",
    "order": "created_at.desc",
    "limit": str(args.limit),
}

if not args.include_archived:
    params["archived_at"] = "is.null"

if args.status:
    statuses = [s.strip() for s in args.status.split(",") if s.strip()]
    if statuses:
        params["status"] = f"in.({','.join(statuses)})"

if args.priority:
    params["priority"] = f"eq.{args.priority}"

if args.relationship:
    params["relationship_strength"] = f"eq.{args.relationship}"

if args.tag:
    tags = [t.strip() for t in args.tag if t and t.strip()]
    if tags:
        params["tags"] = f"cs.{{{','.join(tags)}}}"

if args.company:
    params["company"] = f"ilike.*{args.company}*"

if args.search:
    params["or"] = f"(name.ilike.*{args.search}*,email.ilike.*{args.search}*)"

if args.campaign_id:
    params["campaign_id"] = f"eq.{args.campaign_id}"

rows = api_get("contacts", params)
output(
    {
        "count": len(rows),
        "filters": {
            "status": args.status,
            "priority": args.priority,
            "relationship": args.relationship,
            "tags": args.tag or [],
            "company": args.company,
            "search": args.search,
            "campaign_id": args.campaign_id,
            "include_archived": args.include_archived,
            "limit": args.limit,
        },
        "contacts": rows,
    }
)
