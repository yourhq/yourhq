#!/usr/bin/env python3
"""Fetch one indexed HQ knowledge source by UUID."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_get_knowledge_source.py SOURCE_ID", file=sys.stderr)
    sys.exit(1)

source_id = sys.argv[1]

rows = api_get("knowledge_sources", {
    "select": "id,source_type,source_id,document_id,asset_id,title,tags,folder_id,source_uri,mime_type,meta,archived_at,source_updated_at,extraction_status,extraction_method,extraction_hash,extraction_error,extracted_at,chunk_status,chunk_count,chunk_source_hash,chunks_updated_at,chunk_error,embedding_status,embedding_error,created_at,updated_at",
    "id": f"eq.{source_id}",
    "limit": "1",
})

if not rows:
    output({"error": "not_found", "source_id": source_id})
    sys.exit(1)

output({"source": rows[0]})
