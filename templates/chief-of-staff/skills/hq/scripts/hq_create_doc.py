#!/usr/bin/env python3
"""Create a new document with automatic embedding generation."""

import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    check_env, api_post, audit, get_agent_id,
    generate_embedding, build_embedding_input, AGENT_SLUG, output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--title", required=True)
ap.add_argument("--content", default="")
ap.add_argument("--tags", default="", help="Comma-separated tags")
ap.add_argument("--folder-id", default=None)
args = ap.parse_args()

tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

payload = {
    "title": args.title,
    "content": args.content or None,
    "tags": tags,
    "folder_id": args.folder_id,
    "last_edited_by": f"agent:{AGENT_SLUG}",
}

# Generate embedding
try:
    emb = generate_embedding(build_embedding_input(args.title, args.content, tags))
    if emb:
        payload["embedding"] = emb
except Exception as e:
    print(f"[embed] warning: {e}", file=sys.stderr)

result = api_post("documents", payload)
doc = result[0] if isinstance(result, list) else result

audit("documents", "document", doc["id"], "created",
      summary=f"Agent '{AGENT_SLUG}' created document '{doc['title']}'")

output({"status": "created", "id": doc["id"], "title": doc["title"]})
