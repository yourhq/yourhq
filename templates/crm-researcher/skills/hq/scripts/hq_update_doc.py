#!/usr/bin/env python3
"""Update a document with automatic re-embedding."""

import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    check_env, api_get, api_patch, audit, get_agent_id,
    generate_embedding, build_embedding_input, embedding_source_hash, EMBEDDING_MODEL,
    AGENT_SLUG, output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("doc_id")
ap.add_argument("--title", default=None)
ap.add_argument("--content", default=None)
ap.add_argument("--tags", default=None, help="Comma-separated tags")
args = ap.parse_args()

# Fetch current for merge
current = api_get("documents", {"select": "title,content,tags", "id": f"eq.{args.doc_id}", "limit": "1"})
if not current:
    output({"error": "not_found", "id": args.doc_id})
    sys.exit(1)
current = current[0]

changes = {"last_edited_by": f"agent:{AGENT_SLUG}"}
if args.title is not None:
    changes["title"] = args.title
if args.content is not None:
    changes["content"] = args.content
if args.tags is not None:
    changes["tags"] = [t.strip() for t in args.tags.split(",") if t.strip()]

# Re-embed
merged_title = changes.get("title", current["title"])
merged_content = changes.get("content", current.get("content", ""))
merged_tags = changes.get("tags", current.get("tags", []))

try:
    embedding_input = build_embedding_input(merged_title, merged_content, merged_tags)
    emb = generate_embedding(embedding_input)
    if emb:
        changes["embedding"] = emb
        changes["embedding_model"] = EMBEDDING_MODEL
        changes["embedding_dimensions"] = len(emb)
        changes["embedding_status"] = "indexed"
        changes["embedding_source_hash"] = embedding_source_hash(embedding_input)
        changes["embedding_error"] = None
    else:
        changes["embedding"] = None
        changes["embedding_status"] = "pending"
        changes["embedding_model"] = None
        changes["embedding_dimensions"] = None
        changes["embedding_source_hash"] = None
        changes["embedding_error"] = None
except Exception as e:
    print(f"[embed] warning: {e}", file=sys.stderr)
    changes["embedding"] = None
    changes["embedding_status"] = "pending"
    changes["embedding_model"] = None
    changes["embedding_dimensions"] = None
    changes["embedding_source_hash"] = None
    changes["embedding_error"] = None

result = api_patch("documents", args.doc_id, changes)
audit("documents", "document", args.doc_id, "updated",
      summary=f"Agent '{AGENT_SLUG}' updated document '{merged_title}'")

output({"status": "updated", "id": args.doc_id, "title": merged_title})
