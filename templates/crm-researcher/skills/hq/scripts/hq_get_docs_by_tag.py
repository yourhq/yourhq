#!/usr/bin/env python3
"""Fetch knowledge items by exact tag match."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_get_docs_by_tag.py TAG_NAME", file=sys.stderr)
    sys.exit(1)

tag = sys.argv[1]
rows = api_get("knowledge_items", {
    "select": "id,title,kind,scope,content,tags,folder_id,updated_at",
    "tags": f"cs.{{{tag}}}",
    "archived_at": "is.null",
})
output({"tag": tag, "count": len(rows), "items": rows})
