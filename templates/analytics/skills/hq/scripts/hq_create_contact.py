#!/usr/bin/env python3
"""Create a contact with field validation against pipeline_stages and field_definitions."""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_get, api_post, audit, check_env, now_iso, output, require_crm

check_env()
require_crm()

ap = argparse.ArgumentParser()
ap.add_argument("--name", required=True, help="Contact full name")
ap.add_argument("--email", default=None)
ap.add_argument("--phone", default=None)
ap.add_argument("--company", default=None)
ap.add_argument("--title", default=None, help="Job title")
ap.add_argument("--location", default=None)
ap.add_argument("--linkedin-url", default=None)
ap.add_argument("--twitter-url", default=None)
ap.add_argument("--website-url", default=None)
ap.add_argument("--how-we-met", default=None)
ap.add_argument("--notes", default=None)
ap.add_argument("--status", default=None, help="Pipeline stage key (validated against pipeline_stages)")
ap.add_argument("--priority", default=None, choices=["urgent", "high", "medium", "low"])
ap.add_argument("--relationship", default=None, choices=["stranger", "acquaintance", "warm", "strong"])
ap.add_argument("--source", default=None)
ap.add_argument("--tags", default="", help="Comma-separated tags")
ap.add_argument("--extended", default="{}", help="JSON object of custom fields")
ap.add_argument("--org-id", default=None, help="Organization ID to link (creates contact_organizations record)")
ap.add_argument("--org-role", default=None, help="Role at the organization")
ap.add_argument("--no-validate", action="store_true", help="Skip field_definitions validation on extended")
args = ap.parse_args()

# Validate status against pipeline_stages
status = args.status
if not status:
    stages = api_get("pipeline_stages", {
        "select": "stage_key",
        "entity_type": "eq.contact",
        "is_default": "eq.true",
        "limit": "1",
    })
    status = stages[0]["stage_key"] if stages else ""
else:
    stages = api_get("pipeline_stages", {
        "select": "stage_key",
        "entity_type": "eq.contact",
        "stage_key": f"eq.{status}",
        "limit": "1",
    })
    if not stages:
        output({"error": "invalid_status", "message": f"Status '{status}' is not a valid pipeline stage. Use hq_get_pipeline.py to see valid stages."})
        sys.exit(1)

# Parse and validate extended fields
extended = json.loads(args.extended)
if extended and not args.no_validate:
    field_defs = api_get("field_definitions", {
        "select": "field_key",
        "entity_type": "eq.contact",
        "is_active": "eq.true",
    })
    valid_keys = {f["field_key"] for f in (field_defs or [])}
    invalid = [k for k in extended if k not in valid_keys]
    if invalid:
        output({"error": "invalid_extended_fields", "invalid_keys": invalid, "valid_keys": sorted(valid_keys)})
        sys.exit(1)

tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

payload = {
    "name": args.name,
    "email": args.email,
    "phone": args.phone,
    "company": args.company,
    "title": args.title,
    "location": args.location,
    "linkedin_url": args.linkedin_url,
    "twitter_url": args.twitter_url,
    "website_url": args.website_url,
    "how_we_met": args.how_we_met,
    "notes": args.notes,
    "status": status,
    "status_changed_at": now_iso(),
    "priority": args.priority,
    "relationship_strength": args.relationship or "stranger",
    "source": args.source,
    "tags": tags,
    "extended": extended,
}
# Remove None values to let DB defaults apply
payload = {k: v for k, v in payload.items() if v is not None}

result = api_post("contacts", payload)
contact = result[0] if isinstance(result, list) else result
audit("crm", "contact", contact["id"], "created", summary=f"Agent '{AGENT_SLUG}' created contact '{contact['name']}'")

# Link to organization if specified
if args.org_id:
    link_payload = {
        "contact_id": contact["id"],
        "org_id": args.org_id,
        "role": args.org_role,
        "is_current": True,
    }
    try:
        api_post("contact_organizations", link_payload)
        audit("crm", "contact_organization", contact["id"], "created", summary=f"Linked contact to org {args.org_id}")
    except Exception as e:
        print(f"[warning] failed to link org: {e}", file=sys.stderr)

output({
    "status": "created",
    "id": contact["id"],
    "name": contact["name"],
    "pipeline_status": contact.get("status"),
    "org_linked": args.org_id is not None,
})
