#!/usr/bin/env python3
"""Claim a task and fetch attachment metadata plus relevant knowledge chunks."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_get, api_patch, api_rpc, audit, get_agent_id, AGENT_SLUG, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_claim_task.py TASK_ID", file=sys.stderr)
    sys.exit(1)

task_id = sys.argv[1]
agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_registered"})
    sys.exit(1)

# Claim
result = api_patch("tasks", task_id, {
    "status": "in_progress",
    "assignee_type": "agent",
    "assignee_agent_id": agent_id,
})

audit("tasks", "task", task_id, "assigned",
      summary=f"Agent '{AGENT_SLUG}' claimed task")

# Fetch attachments
attachments = api_get("task_attachments", {
    "select": "id,entity_type,entity_id,url,label",
    "task_id": f"eq.{task_id}",
})

task = result[0] if isinstance(result, list) else result
task_context_query = " ".join(
    part for part in [
        str(task.get("title") or "").strip(),
        str(task.get("description") or "").strip(),
    ] if part
)


def fetch_document_attachment(document_id):
    docs = api_get("documents", {
        "select": "id,title,tags,folder_id,updated_at,chunk_status,chunk_count,embedding_status",
        "id": f"eq.{document_id}",
        "limit": "1",
    })
    doc = docs[0] if docs else None

    sources = api_get("knowledge_sources", {
        "select": "id,source_type,source_id,document_id,title,tags,folder_id,source_uri,extraction_status,chunk_status,chunk_count,embedding_status,chunks_updated_at,embedding_error,chunk_error",
        "source_type": "eq.document",
        "source_id": f"eq.{document_id}",
        "limit": "1",
    })
    source = sources[0] if sources else None

    chunks = []
    if source:
        query = task_context_query or str(doc.get("title") if doc else source.get("title") or "").strip()
        if query:
            try:
                chunks = api_rpc("search_knowledge_chunks_text", {
                    "query_text": query,
                    "match_count": 5,
                    "filter_tags": None,
                    "filter_folder_id": None,
                    "filter_source_type": None,
                    "filter_source_id": source["id"],
                }) or []
            except Exception as e:
                source["chunk_lookup_error"] = str(e)

    return {
        "document": doc,
        "knowledge_source": source,
        "relevant_chunks": chunks,
        "content_access": "Use hq_get_doc.py DOCUMENT_ID for full native content or hq_get_knowledge_chunks.py SOURCE_ID for indexed sections.",
    }


# Resolve documents and assets
resolved = []
for att in attachments:
    entry = dict(att)
    if att["entity_type"] == "document" and att.get("entity_id"):
        entry.update(fetch_document_attachment(att["entity_id"]))
    elif att["entity_type"] == "asset" and att.get("entity_id"):
        assets = api_get("assets", {
            "select": "id,name,type,content,file_url",
            "id": f"eq.{att['entity_id']}",
            "limit": "1",
        })
        entry["asset"] = assets[0] if assets else None
    resolved.append(entry)

output({
    "status": "claimed",
    "task_id": task_id,
    "task_title": task.get("title"),
    "attachment_count": len(resolved),
    "attachments": resolved,
})
