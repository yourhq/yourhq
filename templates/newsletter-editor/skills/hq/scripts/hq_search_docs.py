#!/usr/bin/env python3
"""Search HQ knowledge by natural language query.

Uses semantic chunk search first, then indexed full-text chunk search if local
embeddings are unavailable. Results are grouped by source/document and include
the matched snippets agents should use for context.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_rpc, api_get, generate_embedding, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("query")
ap.add_argument("--tags", default=None, help="Comma-separated tags to filter by")
ap.add_argument("--folder-id", default=None)
ap.add_argument("--source-type", default=None, help="Filter to document, asset, or future external source type")
ap.add_argument("--limit", type=int, default=5)
args = ap.parse_args()

filter_tags = args.tags.split(",") if args.tags else None


def group_results(rows):
    grouped = []
    by_source = {}
    for row in rows or []:
        key = row["knowledge_source_id"]
        if key not in by_source:
            item = {
                "knowledge_source_id": row["knowledge_source_id"],
                "source_type": row["source_type"],
                "source_entity_id": row["source_entity_id"],
                "document_id": row.get("document_id"),
                "asset_id": row.get("asset_id"),
                "title": row["title"],
                "tags": row.get("tags") or [],
                "folder_id": row.get("folder_id"),
                "source_uri": row.get("source_uri"),
                "best_similarity": row.get("similarity"),
                "chunks": [],
            }
            by_source[key] = item
            grouped.append(item)
        by_source[key]["chunks"].append({
            "chunk_id": row["chunk_id"],
            "chunk_index": row["chunk_index"],
            "content": row["content"],
            "char_start": row.get("char_start"),
            "char_end": row.get("char_end"),
            "page_number": row.get("page_number"),
            "section_path": row.get("section_path"),
            "similarity": row.get("similarity"),
            "meta": row.get("meta") or {},
        })
    return grouped[: args.limit]


try:
    embedding = generate_embedding(args.query)
    if embedding:
        rows = api_rpc("search_knowledge_chunks", {
            "query_embedding": embedding,
            "match_count": args.limit * 3,
            "filter_tags": filter_tags,
            "filter_folder_id": args.folder_id,
            "filter_source_type": args.source_type,
            "filter_source_id": None,
        })
        output({"method": "semantic_chunks", "count": len(rows or []), "results": group_results(rows)})
        sys.exit(0)
except Exception as e:
    print(f"[search] semantic chunk search failed, falling back to full-text: {e}", file=sys.stderr)

try:
    rows = api_rpc("search_knowledge_chunks_text", {
        "query_text": args.query,
        "match_count": args.limit * 3,
        "filter_tags": filter_tags,
        "filter_folder_id": args.folder_id,
        "filter_source_type": args.source_type,
        "filter_source_id": None,
    })
    output({"method": "full_text_chunks", "count": len(rows or []), "results": group_results(rows)})
except Exception as e:
    print(f"[search] chunk text RPC failed, falling back to document title/tag scan: {e}", file=sys.stderr)
    words = args.query.split()
    ilike_parts = [f"title.ilike.%{w}%" for w in words]
    params = {
        "select": "id,title,content,tags,folder_id,updated_at",
        "or": f"({','.join(ilike_parts)})",
        "limit": str(args.limit),
    }
    if args.folder_id:
        params["folder_id"] = f"eq.{args.folder_id}"
    results = api_get("documents", params)
    output({"method": "title_fallback", "count": len(results), "results": results})
