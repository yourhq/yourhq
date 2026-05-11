#!/usr/bin/env python3
"""List routines belonging to this agent.

All routines:
  hq_routine_list.py

Active only:
  hq_routine_list.py --active-only

Filter by type:
  hq_routine_list.py --trigger-type schedule
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import (
    AGENT_SLUG,
    api_get,
    check_env,
    get_agent_id,
    output,
)

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--active-only", action="store_true", help="Only show active routines")
ap.add_argument("--trigger-type", default=None, choices=["schedule", "event"])
args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_found", "slug": AGENT_SLUG})
    sys.exit(1)

params = {
    "select": "id,name,instruction,trigger_type,is_active,cadence_type,interval_n,"
              "days_of_week,day_of_month,time_of_day,timezone,entity_type,condition,"
              "field,value,collection_id,next_run_at,last_run_at,run_count",
    "agent_id": f"eq.{agent_id}",
    "order": "created_at.desc",
}

if args.active_only:
    params["is_active"] = "eq.true"
if args.trigger_type:
    params["trigger_type"] = f"eq.{args.trigger_type}"

rows = api_get("routines", params) or []

output({
    "count": len(rows),
    "routines": rows,
})
