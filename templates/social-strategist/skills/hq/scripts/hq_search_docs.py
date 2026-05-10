#!/usr/bin/env python3
"""Search HQ knowledge by natural language query.

Uses semantic search first (vector similarity on knowledge_items), then
full-text search if local embeddings are unavailable, then title scan
as a last resort.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, api_rpc, check_env, generate_embedding, output

check_env()

SOURCE_URL_PATTERNS = {
    "notion": "https://notion.so/{id}",
    "google_drive": "https://drive.google.com/file/d/{id}",
}


def enrich_source_urls(results):
    for r in results:
        meta = r.get("meta") or {}
        if meta.get("source_url"):
            r["source_url"] = meta["source_url"]
        elif r.get("source_external_id") and r.get("kind") == "source":
            provider = meta.get("provider")
            if provider and provider in SOURCE_URL_PATTERNS:
                ext_id = r["source_external_id"].replace("-", "")
                r["source_url"] = SOURCE_URL_PATTERNS[provider].format(id=ext_id)
    return results


ap = argparse.ArgumentParser()
ap.add_argument("query")
ap.add_argument("--tags", default=None, help="Comma-separated tags to filter by")
ap.add_argument("--folder-id", default=None)
ap.add_argument("--kind", default=None, help="Filter by kind: page, skill, file, source")
ap.add_argument("--limit", type=int, default=5)
args = ap.parse_args()

filter_tags = args.tags.split(",") if args.tags else None

try:
    embedding = generate_embedding(args.query)
    if embedding:
        rows = api_rpc(
            "search_knowledge_items",
            {
                "query_embedding": embedding,
                "match_count": args.limit,
                "filter_tags": filter_tags,
                "filter_folder_id": args.folder_id,
                "filter_kind": args.kind,
            },
        )
        output({"method": "semantic", "count": len(rows or []), "results": enrich_source_urls(rows or [])})
        sys.exit(0)
except Exception as e:
    print(f"[search] semantic search failed, falling back to full-text: {e}", file=sys.stderr)

try:
    rows = api_rpc(
        "search_knowledge_items_text",
        {
            "query_text": args.query,
            "match_count": args.limit,
            "filter_tags": filter_tags,
            "filter_folder_id": args.folder_id,
            "filter_kind": args.kind,
        },
    )
    output({"method": "full_text", "count": len(rows or []), "results": enrich_source_urls(rows or [])})
except Exception as e:
    print(f"[search] text RPC failed, falling back to title scan: {e}", file=sys.stderr)
    words = args.query.split()
    ilike_parts = [f"title.ilike.%{w}%" for w in words]
    params = {
        "select": "id,title,kind,scope,tags,folder_id,updated_at",
        "or": f"({','.join(ilike_parts)})",
        "archived_at": "is.null",
        "limit": str(args.limit),
    }
    if args.folder_id:
        params["folder_id"] = f"eq.{args.folder_id}"
    if args.kind:
        params["kind"] = f"eq.{args.kind}"
    results = api_get("knowledge_items", params)
    output({"method": "title_fallback", "count": len(results), "results": results})
