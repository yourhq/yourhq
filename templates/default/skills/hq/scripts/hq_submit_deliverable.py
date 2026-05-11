#!/usr/bin/env python3
"""Submit a deliverable (work product) to a task for human review.

Usage:
  hq_submit_deliverable.py --task-id <uuid> --type page --title "Blog post draft" --content "..."
  hq_submit_deliverable.py --task-id <uuid> --type url --url "https://github.com/..." --title "PR #42"
  hq_submit_deliverable.py --task-id <uuid> --type record --record-id <uuid> --title "New lead"
  hq_submit_deliverable.py --task-id <uuid> --update --deliverable-id <uuid> --content "revised..."
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_SLUG,
    api_get,
    api_patch,
    api_post,
    audit,
    check_env,
    get_agent_id,
    now_iso,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--task-id", required=True)
ap.add_argument("--type", choices=["page", "url", "record"], default="page")
ap.add_argument("--title", required=True)
ap.add_argument("--content", default=None)
ap.add_argument("--url", default=None)
ap.add_argument("--record-id", default=None)
ap.add_argument("--update", action="store_true")
ap.add_argument("--deliverable-id", default=None)
args = ap.parse_args()

agent_id = get_agent_id()

if args.update and args.deliverable_id:
    # Update existing deliverable — reset review status to draft
    link = api_get("entity_links", {
        "select": "id,target_type,target_id",
        "id": f"eq.{args.deliverable_id}",
        "limit": "1",
    })
    if not link:
        output({"error": "deliverable_not_found", "deliverable_id": args.deliverable_id})
        sys.exit(1)

    link = link[0]
    if link["target_type"] == "knowledge_item" and link["target_id"] and args.content:
        api_patch("knowledge_items", link["target_id"], {
            "body": args.content,
            "updated_at": now_iso(),
        })

    api_patch("entity_links", args.deliverable_id, {
        "review_status": "draft",
        "review_note": None,
        "reviewed_at": None,
        "label": args.title,
    })

    audit("tasks", "entity_link", args.deliverable_id, "updated",
          summary=f"Agent '{AGENT_SLUG}' updated deliverable on task")

    output({
        "status": "updated",
        "deliverable_id": args.deliverable_id,
        "task_id": args.task_id,
        "review_status": "draft",
    })
    sys.exit(0)

# Create new deliverable
if args.type == "page":
    if not args.content:
        output({"error": "content_required", "message": "--content is required for type 'page'"})
        sys.exit(1)

    ki = api_post("knowledge_items", {
        "title": args.title,
        "kind": "page",
        "scope": "workspace",
        "body": args.content,
    })
    ki = ki[0] if isinstance(ki, list) else ki

    link = api_post("entity_links", {
        "owner_type": "task",
        "owner_id": args.task_id,
        "target_type": "knowledge_item",
        "target_id": ki["id"],
        "label": args.title,
        "is_deliverable": True,
        "review_status": "draft",
        "submitted_by_agent_id": agent_id,
    })
    link = link[0] if isinstance(link, list) else link

    audit("tasks", "entity_link", link["id"], "created",
          summary=f"Agent '{AGENT_SLUG}' submitted page deliverable: {args.title}")

    output({
        "status": "submitted",
        "deliverable_id": link["id"],
        "knowledge_item_id": ki["id"],
        "task_id": args.task_id,
        "review_status": "draft",
    })

elif args.type == "url":
    if not args.url:
        output({"error": "url_required", "message": "--url is required for type 'url'"})
        sys.exit(1)

    link = api_post("entity_links", {
        "owner_type": "task",
        "owner_id": args.task_id,
        "target_type": "url",
        "url": args.url,
        "label": args.title,
        "is_deliverable": True,
        "review_status": "draft",
        "submitted_by_agent_id": agent_id,
    })
    link = link[0] if isinstance(link, list) else link

    audit("tasks", "entity_link", link["id"], "created",
          summary=f"Agent '{AGENT_SLUG}' submitted URL deliverable: {args.title}")

    output({
        "status": "submitted",
        "deliverable_id": link["id"],
        "task_id": args.task_id,
        "url": args.url,
        "review_status": "draft",
    })

elif args.type == "record":
    if not args.record_id:
        output({"error": "record_id_required", "message": "--record-id is required for type 'record'"})
        sys.exit(1)

    link = api_post("entity_links", {
        "owner_type": "task",
        "owner_id": args.task_id,
        "target_type": "collection_record",
        "target_id": args.record_id,
        "label": args.title,
        "is_deliverable": True,
        "review_status": "draft",
        "submitted_by_agent_id": agent_id,
    })
    link = link[0] if isinstance(link, list) else link

    audit("tasks", "entity_link", link["id"], "created",
          summary=f"Agent '{AGENT_SLUG}' submitted record deliverable: {args.title}")

    output({
        "status": "submitted",
        "deliverable_id": link["id"],
        "record_id": args.record_id,
        "task_id": args.task_id,
        "review_status": "draft",
    })
