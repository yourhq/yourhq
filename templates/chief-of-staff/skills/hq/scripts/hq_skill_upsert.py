#!/usr/bin/env python3
"""Create or update a skill scoped to this agent, with automatic embedding and junction linking."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_SLUG,
    api_patch,
    api_post,
    audit,
    build_embedding_input,
    check_env,
    content_for_storage,
    generate_embedding,
    get_agent_id,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--title", required=True)
ap.add_argument("--content", required=True)
ap.add_argument("--reason", required=True, help="One-line explanation of what changed")
ap.add_argument("--item-id", default=None, help="Existing skill ID (for updates)")
ap.add_argument("--tags", default="", help="Comma-separated tags")
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_found", "slug": AGENT_SLUG})
    sys.exit(1)

tags = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []

tiptap_json, plain_text = content_for_storage(args.content)

if args.item_id:
    # Update existing skill
    changes = {
        "title": args.title,
        "content": tiptap_json,
        "plain_text": plain_text,
    }
    if tags:
        changes["tags"] = tags

    try:
        embedding_input = build_embedding_input(args.title, plain_text, tags)
        emb = generate_embedding(embedding_input)
        if emb:
            changes["embedding"] = emb
            changes["embedding_status"] = "indexed"
        else:
            changes["embedding_status"] = "pending"
    except Exception as e:
        print(f"[embed] warning: {e}", file=sys.stderr)
        changes["embedding_status"] = "pending"

    api_patch("knowledge_items", args.item_id, changes)
    audit("knowledge", "knowledge_item", args.item_id, "updated", summary=args.reason)
    output({"status": "updated", "id": args.item_id, "title": args.title, "reason": args.reason})

else:
    # Create new skill scoped to this agent
    payload = {
        "title": args.title,
        "content": tiptap_json,
        "plain_text": plain_text,
        "kind": "skill",
        "scope": "agent",
        "tags": tags,
        "embedding_status": "pending",
        "processing_status": "done",
    }

    try:
        embedding_input = build_embedding_input(args.title, plain_text, tags)
        emb = generate_embedding(embedding_input)
        if emb:
            payload["embedding"] = emb
            payload["embedding_status"] = "indexed"
    except Exception as e:
        print(f"[embed] warning: {e}", file=sys.stderr)

    result = api_post("knowledge_items", payload)
    item = result[0] if isinstance(result, list) else result
    item_id = item["id"]

    # Link skill to this agent via junction table
    try:
        api_post(
            "knowledge_item_agents",
            {
                "knowledge_item_id": item_id,
                "agent_id": agent_id,
            },
        )
    except Exception as e:
        print(f"[junction] warning: {e}", file=sys.stderr)

    audit("knowledge", "knowledge_item", item_id, "created", summary=args.reason)
    output({"status": "created", "id": item_id, "title": args.title, "reason": args.reason})

