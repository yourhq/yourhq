#!/usr/bin/env python3
"""Delete a routine owned by this agent.

Usage:
  hq_routine_delete.py ROUTINE_ID
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_SLUG,
    api_delete,
    api_get,
    audit,
    check_env,
    get_agent_id,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("routine_id", help="UUID of the routine to delete")
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_found", "slug": AGENT_SLUG})
    sys.exit(1)

existing = api_get("routines", {
    "select": "id,agent_id,name",
    "id": f"eq.{args.routine_id}",
    "limit": "1",
})
if not existing:
    output({"error": "not_found", "routine_id": args.routine_id})
    sys.exit(1)

routine = existing[0]
if routine["agent_id"] != agent_id:
    output({"error": "not_owned", "message": "This routine belongs to a different agent."})
    sys.exit(1)

api_delete("routines", args.routine_id)
audit("routines", "routine", args.routine_id, "deleted",
      summary=f"Agent '{AGENT_SLUG}' deleted routine '{routine['name']}'")
output({
    "status": "deleted",
    "id": args.routine_id,
    "name": routine["name"],
})
