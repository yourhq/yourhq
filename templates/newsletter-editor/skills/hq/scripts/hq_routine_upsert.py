#!/usr/bin/env python3
"""Create or update a routine scoped to this agent.

Schedule routine:
  hq_routine_upsert.py --name "Check email" --instruction "Check inbox for emails from john@acme.com" \
    --trigger-type schedule --cadence-type every_n_minutes --interval-n 30 --timezone America/New_York

Event routine:
  hq_routine_upsert.py --name "New contact alert" --instruction "Research {name} and update their profile" \
    --trigger-type event --entity-type contact --condition created

Update existing:
  hq_routine_upsert.py --routine-id UUID --name "Check email" --instruction "..." \
    --trigger-type schedule --cadence-type every_n_hours --interval-n 1 --timezone America/New_York
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
    api_rpc,
    audit,
    check_env,
    get_agent_id,
    now_iso,
    output,
)

check_env()

VALID_CADENCE_TYPES = [
    "every_n_minutes",
    "every_n_hours",
    "daily",
    "weekdays",
    "weekly",
    "monthly",
    "every_n_days",
]
VALID_ENTITY_TYPES = ["contact", "collection_record", "knowledge_item", "task"]
VALID_CONDITIONS = ["created", "changed_to", "changed_from", "any_change"]

ap = argparse.ArgumentParser()
ap.add_argument("--routine-id", default=None, help="Existing routine ID (for updates)")
ap.add_argument("--name", required=True)
ap.add_argument("--instruction", required=True)
ap.add_argument("--trigger-type", required=True, choices=["schedule", "event"])
ap.add_argument("--is-active", default=True, type=lambda v: v.lower() in ("true", "1", "yes"))

# Schedule fields
ap.add_argument("--cadence-type", default=None, choices=VALID_CADENCE_TYPES)
ap.add_argument("--interval-n", default=None, type=int)
ap.add_argument("--days-of-week", default=None, help="Comma-separated ISO day numbers (1=Mon, 7=Sun)")
ap.add_argument("--day-of-month", default=None, type=int)
ap.add_argument("--time-of-day", default=None, help="HH:MM format, e.g. 09:00")
ap.add_argument("--timezone", default=None)

# Event fields
ap.add_argument("--entity-type", default=None, choices=VALID_ENTITY_TYPES)
ap.add_argument("--condition", default=None, choices=VALID_CONDITIONS)
ap.add_argument("--field", default=None)
ap.add_argument("--value", default=None)
ap.add_argument("--collection-id", default=None)

args = ap.parse_args()

agent_id = get_agent_id()
if not agent_id:
    output({"error": "agent_not_found", "slug": AGENT_SLUG})
    sys.exit(1)

# Validation
if args.trigger_type == "schedule":
    if not args.cadence_type:
        output({"error": "validation", "message": "--cadence-type is required for schedule routines"})
        sys.exit(1)
    if not args.timezone:
        output({"error": "validation", "message": "--timezone is required for schedule routines"})
        sys.exit(1)
elif args.trigger_type == "event":
    if not args.entity_type:
        output({"error": "validation", "message": "--entity-type is required for event routines"})
        sys.exit(1)
    if not args.condition:
        output({"error": "validation", "message": "--condition is required for event routines"})
        sys.exit(1)

days_of_week = []
if args.days_of_week:
    days_of_week = [int(d.strip()) for d in args.days_of_week.split(",") if d.strip()]

payload = {
    "name": args.name,
    "instruction": args.instruction,
    "trigger_type": args.trigger_type,
    "agent_id": agent_id,
    "agent_slug": AGENT_SLUG,
    "is_active": args.is_active,
}

if args.trigger_type == "schedule":
    payload["cadence_type"] = args.cadence_type
    payload["interval_n"] = args.interval_n
    payload["days_of_week"] = days_of_week
    payload["day_of_month"] = args.day_of_month
    payload["time_of_day"] = args.time_of_day
    payload["timezone"] = args.timezone
    # Clear event fields
    payload["entity_type"] = None
    payload["collection_id"] = None
    payload["field"] = None
    payload["condition"] = None
    payload["value"] = None

    # Compute next_run_at
    try:
        next_run = api_rpc(
            "routine_next_occurrence",
            {
                "p_cadence_type": args.cadence_type,
                "p_interval_n": args.interval_n,
                "p_days_of_week": days_of_week,
                "p_day_of_month": args.day_of_month,
                "p_time_of_day": args.time_of_day,
                "p_timezone": args.timezone,
                "p_from": now_iso(),
            },
        )
        payload["next_run_at"] = next_run
    except Exception as e:
        print(f"[next_run] warning: {e}", file=sys.stderr)

else:
    payload["entity_type"] = args.entity_type
    payload["condition"] = args.condition
    payload["field"] = args.field if args.condition != "created" else None
    payload["value"] = args.value if args.condition in ("changed_to", "changed_from") else None
    payload["collection_id"] = args.collection_id if args.entity_type == "collection_record" else None
    # Clear schedule fields
    payload["cadence_type"] = None
    payload["interval_n"] = None
    payload["days_of_week"] = []
    payload["day_of_month"] = None
    payload["time_of_day"] = None
    payload["timezone"] = None
    payload["next_run_at"] = None


if args.routine_id:
    # Update — verify ownership first
    existing = api_get(
        "routines",
        {
            "select": "id,agent_id",
            "id": f"eq.{args.routine_id}",
            "limit": "1",
        },
    )
    if not existing:
        output({"error": "not_found", "routine_id": args.routine_id})
        sys.exit(1)
    if existing[0]["agent_id"] != agent_id:
        output({"error": "not_owned", "message": "This routine belongs to a different agent."})
        sys.exit(1)

    api_patch("routines", args.routine_id, payload)
    audit(
        "routines", "routine", args.routine_id, "updated", summary=f"Agent '{AGENT_SLUG}' updated routine '{args.name}'"
    )
    output(
        {
            "status": "updated",
            "id": args.routine_id,
            "name": args.name,
            "trigger_type": args.trigger_type,
            "next_run_at": payload.get("next_run_at"),
        }
    )

else:
    result = api_post("routines", payload)
    routine = result[0] if isinstance(result, list) else result
    routine_id = routine["id"]
    audit("routines", "routine", routine_id, "created", summary=f"Agent '{AGENT_SLUG}' created routine '{args.name}'")
    output(
        {
            "status": "created",
            "id": routine_id,
            "name": args.name,
            "trigger_type": args.trigger_type,
            "next_run_at": payload.get("next_run_at"),
        }
    )
