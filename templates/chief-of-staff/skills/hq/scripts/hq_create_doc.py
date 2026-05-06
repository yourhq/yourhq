#!/usr/bin/env python3
"""Create a new knowledge item (page or playbook) with automatic embedding."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_SLUG,
    api_post,
    audit,
    build_embedding_input,
    check_env,
    generate_embedding,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--title", required=True)
ap.add_argument("--content", default="")
ap.add_argument("--kind", default="page", choices=["page", "playbook"])
ap.add_argument("--scope", default="workspace", choices=["workspace", "agent"])
ap.add_argument("--tags", default="", help="Comma-separated tags")
ap.add_argument("--folder-id", default=None)
args = ap.parse_args()

tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

payload = {
    "title": args.title,
    "content": args.content or None,
    "plain_text": args.content or None,
    "kind": args.kind,
    "scope": args.scope,
    "tags": tags,
    "folder_id": args.folder_id,
    "embedding_status": "pending",
    "processing_status": "done",
}

try:
    embedding_input = build_embedding_input(args.title, args.content, tags)
    emb = generate_embedding(embedding_input)
    if emb:
        payload["embedding"] = emb
        payload["embedding_status"] = "indexed"
except Exception as e:
    print(f"[embed] warning: {e}", file=sys.stderr)

result = api_post("knowledge_items", payload)
item = result[0] if isinstance(result, list) else result

audit(
    "knowledge",
    "knowledge_item",
    item["id"],
    "created",
    summary=f"Agent '{AGENT_SLUG}' created {args.kind} '{item['title']}'",
)

output({"status": "created", "id": item["id"], "title": item["title"], "kind": args.kind})
