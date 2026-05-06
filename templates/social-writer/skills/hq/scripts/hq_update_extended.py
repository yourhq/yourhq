#!/usr/bin/env python3
"""
Update extended fields on a contact or organization.
Atomic read-modify-write: reads current extended, merges new fields, writes back.
Validates field keys against field_definitions.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_get, api_patch, audit, check_env, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("table", choices=["contacts", "organizations"])
ap.add_argument("record_id")
ap.add_argument("--data", required=True, help="JSON object of extended fields to set")
ap.add_argument("--validate", action="store_true", default=True)
ap.add_argument("--no-validate", dest="validate", action="store_false")
args = ap.parse_args()

new_fields = json.loads(args.data)
entity_type = "contact" if args.table == "contacts" else "organization"

# Optionally validate against field_definitions
if args.validate:
    definitions = api_get(
        "field_definitions",
        {
            "entity_type": f"eq.{entity_type}",
            "is_active": "eq.true",
            "select": "field_key,field_type,required",
        },
    )
    valid_keys = {d["field_key"] for d in definitions}
    unknown = set(new_fields.keys()) - valid_keys
    if unknown:
        output({"error": "unknown_fields", "unknown": list(unknown), "valid_keys": sorted(valid_keys)})
        sys.exit(1)

# Read current extended
current = api_get(args.table, {"select": "extended", "id": f"eq.{args.record_id}", "limit": "1"})
if not current:
    output({"error": "not_found", "id": args.record_id})
    sys.exit(1)

extended = current[0].get("extended") or {}
extended.update(new_fields)

# Write back
api_patch(args.table, args.record_id, {"extended": extended})

module = "crm" if args.table == "contacts" else "crm"
audit(
    module,
    entity_type,
    args.record_id,
    "updated",
    summary=f"Agent '{AGENT_SLUG}' updated {entity_type} extended fields",
    changes={"extended": {"old": "...", "new": {k: new_fields[k] for k in new_fields}}},
)

output({"status": "updated", "id": args.record_id, "fields_set": list(new_fields.keys())})
