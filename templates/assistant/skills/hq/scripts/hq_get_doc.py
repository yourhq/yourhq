#!/usr/bin/env python3
"""Fetch a single document by ID."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_get_doc.py DOCUMENT_ID", file=sys.stderr)
    sys.exit(1)

doc_id = sys.argv[1]
rows = api_get("documents", {"select": "*", "id": f"eq.{doc_id}", "limit": "1"})

if not rows:
    output({"error": "not_found", "id": doc_id})
    sys.exit(1)

output(rows[0])
