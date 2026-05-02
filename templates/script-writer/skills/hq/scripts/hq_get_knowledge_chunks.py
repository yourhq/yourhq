#!/usr/bin/env python3
"""Fetch indexed chunks for a knowledge item."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, api_rpc, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("item_id", help="knowledge_items.id")
ap.add_argument("--query", default=None, help="Optional full-text query scoped to this item")
ap.add_argument("--limit", type=int, default=25)
args = ap.parse_args()

if args.query:
    chunks = api_rpc("search_knowledge_chunks_text", {
        "query_text": args.query,
        "match_count": args.limit,
        "filter_tags": None,
        "filter_folder_id": None,
        "filter_source_type": None,
        "filter_source_id": None,
    }) or []
    chunks = [c for c in chunks if c.get("knowledge_item_id") == args.item_id][:args.limit]
    output({
        "item_id": args.item_id,
        "method": "text_search",
        "query": args.query,
        "count": len(chunks),
        "chunks": chunks,
    })
    sys.exit(0)

chunks = api_get("knowledge_chunks", {
    "select": "id,knowledge_item_id,chunk_index,content,content_hash,char_start,char_end,page_number,section_path,meta,embedding_status,created_at,updated_at",
    "knowledge_item_id": f"eq.{args.item_id}",
    "order": "chunk_index.asc",
    "limit": str(args.limit),
})

output({
    "item_id": args.item_id,
    "method": "direct_chunks",
    "count": len(chunks or []),
    "chunks": chunks or [],
})
