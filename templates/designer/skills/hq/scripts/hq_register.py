#!/usr/bin/env python3
"""Register this agent in the HQ."""

import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_post, api_get, api_patch, AGENT_SLUG, now_iso, output

check_env()

# Read agent.json if available for metadata
agent_meta = {}
search_dir = os.path.dirname(os.path.abspath(__file__))
for _ in range(5):
    candidate = os.path.join(search_dir, "agent.json")
    if os.path.exists(candidate):
        with open(candidate) as f:
            agent_meta = json.load(f)
        break
    parent = os.path.dirname(search_dir)
    if parent == search_dir:
        break
    search_dir = parent

# Upsert: check if exists first
existing = api_get("agents", {"select": "id", "slug": f"eq.{AGENT_SLUG}", "limit": "1"})

payload = {
    "slug": AGENT_SLUG,
    "name": agent_meta.get("name", AGENT_SLUG),
    "description": agent_meta.get("description"),
    "domains": agent_meta.get("domains", []),
    "capabilities": agent_meta.get("capabilities", []),
    "status": "online",
    "last_seen_at": now_iso(),
}

if existing:
    result = api_patch("agents", existing[0]["id"], payload)
    output({"status": "registered", "action": "updated", "agent_id": existing[0]["id"], "slug": AGENT_SLUG})
else:
    result = api_post("agents", payload)
    agent_id = result[0]["id"] if isinstance(result, list) else result.get("id")
    output({"status": "registered", "action": "created", "agent_id": agent_id, "slug": AGENT_SLUG})
