#!/usr/bin/env python3
"""Update a record in any table with audit logging."""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_get, api_patch, audit, check_env, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("table")
ap.add_argument("record_id")
ap.add_argument("--data", required=True, help="JSON object with fields to update")
ap.add_argument("--module", required=True)
ap.add_argument("--entity-type", required=True)
args = ap.parse_args()

changes = json.loads(args.data)

# Fetch before for diff
before = api_get(args.table, {"select": "*", "id": f"eq.{args.record_id}", "limit": "1"})
before = before[0] if before else {}

result = api_patch(args.table, args.record_id, changes)
after = result[0] if isinstance(result, list) else result

# Compute diff
diff = {}
for key in changes:
    old_val = before.get(key)
    new_val = after.get(key) if after else changes[key]
    if json.dumps(old_val, sort_keys=True) != json.dumps(new_val, sort_keys=True):
        diff[key] = {"old": old_val, "new": new_val}

audit(
    args.module,
    args.entity_type,
    args.record_id,
    "updated",
    summary=f"Agent '{AGENT_SLUG}' updated {args.entity_type} '{after.get('name', after.get('title', args.record_id))}'",
    changes=diff if diff else None,
)

output({"status": "updated", "id": args.record_id, "table": args.table, "changes": diff})
