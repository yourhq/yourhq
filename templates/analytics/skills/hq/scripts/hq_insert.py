#!/usr/bin/env python3
"""Insert a record into any table with audit logging."""

import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_post, audit, AGENT_SLUG, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("table")
ap.add_argument("--data", required=True, help="JSON object to insert")
ap.add_argument("--module", required=True)
ap.add_argument("--entity-type", required=True)
args = ap.parse_args()

payload = json.loads(args.data)
result = api_post(args.table, payload)
row = result[0] if isinstance(result, list) else result

audit(args.module, args.entity_type, row["id"], "created",
      summary=f"Agent '{AGENT_SLUG}' created {args.entity_type} '{row.get('name', row.get('title', row['id']))}'")

output({"status": "created", "id": row["id"], "table": args.table})
