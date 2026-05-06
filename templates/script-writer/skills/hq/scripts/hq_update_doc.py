#!/usr/bin/env python3
"""Update a knowledge item with automatic re-embedding."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_SLUG,
    api_get,
    api_patch,
    audit,
    build_embedding_input,
    check_env,
    generate_embedding,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("item_id")
ap.add_argument("--title", default=None)
ap.add_argument("--content", default=None)
ap.add_argument("--tags", default=None, help="Comma-separated tags")
args = ap.parse_args()

current = api_get(
    "knowledge_items", {"select": "title,content,plain_text,tags", "id": f"eq.{args.item_id}", "limit": "1"}
)
if not current:
    output({"error": "not_found", "id": args.item_id})
    sys.exit(1)
current = current[0]

changes = {}
if args.title is not None:
    changes["title"] = args.title
if args.content is not None:
    changes["content"] = args.content
    changes["plain_text"] = args.content
if args.tags is not None:
    changes["tags"] = [t.strip() for t in args.tags.split(",") if t.strip()]

merged_title = changes.get("title", current["title"])
merged_content = changes.get("content", current.get("content", ""))
merged_tags = changes.get("tags", current.get("tags", []))

try:
    embedding_input = build_embedding_input(merged_title, merged_content, merged_tags)
    emb = generate_embedding(embedding_input)
    if emb:
        changes["embedding"] = emb
        changes["embedding_status"] = "indexed"
    else:
        changes["embedding_status"] = "pending"
except Exception as e:
    print(f"[embed] warning: {e}", file=sys.stderr)
    changes["embedding_status"] = "pending"

result = api_patch("knowledge_items", args.item_id, changes)
audit("knowledge", "knowledge_item", args.item_id, "updated", summary=f"Agent '{AGENT_SLUG}' updated '{merged_title}'")

output({"status": "updated", "id": args.item_id, "title": merged_title})
