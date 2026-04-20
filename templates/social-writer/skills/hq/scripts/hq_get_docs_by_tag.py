#!/usr/bin/env python3
"""Fetch documents by exact tag match."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_get_docs_by_tag.py TAG_NAME", file=sys.stderr)
    sys.exit(1)

tag = sys.argv[1]
rows = api_get("documents", {
    "select": "id,title,content,tags,folder_id,updated_at",
    "tags": f"cs.{{{tag}}}",
})
output({"tag": tag, "count": len(rows), "documents": rows})
