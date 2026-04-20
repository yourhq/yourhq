#!/usr/bin/env python3
"""Fetch boot documents tagged boot:all and boot:AGENT_SLUG."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, AGENT_SLUG, output

check_env()

# Supabase 'or' filter: tags contains boot:all OR tags contains boot:{slug}
# Using two separate queries since PostgREST 'or' with array contains is tricky
docs_all = api_get("documents", {
    "select": "id,title,content,tags,folder_id",
    "tags": f"cs.{{boot:all}}",
})

docs_agent = api_get("documents", {
    "select": "id,title,content,tags,folder_id",
    "tags": f"cs.{{boot:{AGENT_SLUG}}}",
})

# Dedupe by id
seen = set()
docs = []
for d in docs_all + docs_agent:
    if d["id"] not in seen:
        seen.add(d["id"])
        docs.append(d)

output({
    "boot_document_count": len(docs),
    "documents": docs,
})
