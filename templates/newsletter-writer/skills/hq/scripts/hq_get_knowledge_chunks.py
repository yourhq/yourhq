#!/usr/bin/env python3
"""Fetch indexed chunks for one HQ knowledge source."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, api_rpc, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("source_id", help="knowledge_sources.id")
ap.add_argument("--query", default=None, help="Optional full-text query scoped to this source")
ap.add_argument("--limit", type=int, default=25)
args = ap.parse_args()

if args.query:
    chunks = api_rpc("search_knowledge_chunks_text", {
        "query_text": args.query,
        "match_count": args.limit,
        "filter_tags": None,
        "filter_folder_id": None,
        "filter_source_type": None,
        "filter_source_id": args.source_id,
    }) or []
    output({
        "source_id": args.source_id,
        "method": "source_text_search",
        "query": args.query,
        "count": len(chunks),
        "chunks": chunks,
    })
    sys.exit(0)

chunks = api_get("knowledge_chunks", {
    "select": "id,source_id,source_type,source_entity_id,document_id,asset_id,chunk_index,content,content_hash,char_start,char_end,page_number,section_path,source_uri,meta,embedding_status,embedding_model,embedding_dimensions,embedding_updated_at,created_at,updated_at",
    "source_id": f"eq.{args.source_id}",
    "order": "chunk_index.asc",
    "limit": str(args.limit),
})

output({
    "source_id": args.source_id,
    "method": "source_chunks",
    "count": len(chunks or []),
    "chunks": chunks or [],
})
