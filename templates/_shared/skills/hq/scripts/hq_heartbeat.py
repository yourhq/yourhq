#!/usr/bin/env python3
"""Send a heartbeat — update status and last_seen_at."""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_get, api_patch, check_env, now_iso, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--status", default="online", choices=["online", "offline", "error", "paused"])
args = ap.parse_args()

existing = api_get("agents", {"select": "id", "slug": f"eq.{AGENT_SLUG}", "limit": "1"})
if not existing:
    output({"error": "agent_not_registered", "slug": AGENT_SLUG})
    sys.exit(1)

agent_id = existing[0]["id"]
api_patch(
    "agents",
    agent_id,
    {
        "status": args.status,
        "last_seen_at": now_iso(),
    },
)

output({"status": args.status, "agent_id": agent_id, "last_seen_at": now_iso()})
