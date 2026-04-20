#!/usr/bin/env python3
"""Search documents by natural language query (semantic + text fallback)."""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_rpc, api_get, generate_embedding, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("query")
ap.add_argument("--tags", default=None, help="Comma-separated tags to filter by")
ap.add_argument("--folder-id", default=None)
ap.add_argument("--limit", type=int, default=5)
args = ap.parse_args()

filter_tags = args.tags.split(",") if args.tags else None

# Try semantic search first
try:
    embedding = generate_embedding(args.query)
    if embedding:
        results = api_rpc("search_documents", {
            "query_embedding": embedding,
            "match_count": args.limit,
            "filter_tags": filter_tags,
            "filter_folder_id": args.folder_id,
        })
        output({"method": "semantic", "count": len(results), "results": results})
        sys.exit(0)
except Exception as e:
    print(f"[search] semantic search failed, falling back to text: {e}", file=sys.stderr)

# Text fallback
words = args.query.split()
ilike_parts = []
for w in words:
    ilike_parts.append(f"title.ilike.%{w}%")
    ilike_parts.append(f"content.ilike.%{w}%")

params = {
    "select": "id,title,content,tags,folder_id,updated_at",
    "or": f"({','.join(ilike_parts)})",
    "limit": str(args.limit),
}
if args.folder_id:
    params["folder_id"] = f"eq.{args.folder_id}"

results = api_get("documents", params)
output({"method": "text_fallback", "count": len(results), "results": results})
