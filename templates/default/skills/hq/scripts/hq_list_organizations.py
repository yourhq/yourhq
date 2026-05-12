#!/usr/bin/env python3
"""List organizations with flexible filters."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, require_crm, output

check_env()
require_crm()

ap = argparse.ArgumentParser()
ap.add_argument("--type", default=None, help="Filter by type (company,agency,vc_firm,community,recruiting_firm,other)")
ap.add_argument("--industry", default=None, help="Filter by industry (partial match)")
ap.add_argument("--search", default=None, help="Search by name (partial match)")
ap.add_argument("--tag", action="append", default=None, help="Filter by tag; can be passed multiple times")
ap.add_argument("--include-archived", action="store_true", help="Include archived organizations")
ap.add_argument("--limit", type=int, default=50)
args = ap.parse_args()

params = {
    "select": "id,name,type,website,industry,size,location,status,tags,created_at",
    "order": "created_at.desc",
    "limit": str(args.limit),
}

if not args.include_archived:
    params["archived_at"] = "is.null"

if args.type:
    params["type"] = f"eq.{args.type}"

if args.industry:
    params["industry"] = f"ilike.*{args.industry}*"

if args.search:
    params["name"] = f"ilike.*{args.search}*"

if args.tag:
    tags = [t.strip() for t in args.tag if t and t.strip()]
    if tags:
        params["tags"] = f"cs.{{{','.join(tags)}}}"

rows = api_get("organizations", params)
output(
    {
        "count": len(rows),
        "filters": {
            "type": args.type,
            "industry": args.industry,
            "search": args.search,
            "tags": args.tag or [],
            "include_archived": args.include_archived,
            "limit": args.limit,
        },
        "organizations": rows,
    }
)
