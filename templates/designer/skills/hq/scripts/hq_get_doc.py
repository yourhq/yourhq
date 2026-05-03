#!/usr/bin/env python3
"""Fetch a single knowledge item by ID."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_get_doc.py ITEM_ID", file=sys.stderr)
    sys.exit(1)

item_id = sys.argv[1]
rows = api_get("knowledge_items", {"select": "*", "id": f"eq.{item_id}", "limit": "1"})

if not rows:
    output({"error": "not_found", "id": item_id})
    sys.exit(1)

output(rows[0])
