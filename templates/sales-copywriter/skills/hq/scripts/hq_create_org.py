#!/usr/bin/env python3
"""Create an organization."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_post, audit, check_env, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--name", required=True)
ap.add_argument("--type", default=None, help="company, agency, vc_firm, community, recruiting_firm, other")
ap.add_argument("--website", default=None)
ap.add_argument("--industry", default=None)
ap.add_argument("--location", default=None)
ap.add_argument("--description", default=None)
ap.add_argument("--tags", default="", help="Comma-separated tags")
ap.add_argument("--extended", default="{}", help="JSON object of custom fields")
args = ap.parse_args()

tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []
payload = {k: v for k, v in {
    "name": args.name, "type": args.type, "website": args.website,
    "industry": args.industry, "location": args.location,
    "description": args.description, "tags": tags,
    "extended": json.loads(args.extended),
}.items() if v is not None}

result = api_post("organizations", payload)
org = result[0] if isinstance(result, list) else result
audit("crm", "organization", org["id"], "created",
      summary=f"Agent '{AGENT_SLUG}' created organization '{org['name']}'")
output({"status": "created", "id": org["id"], "name": org["name"]})
