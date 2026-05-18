#!/usr/bin/env python3
"""Write content to a connected external source via the gateway command queue."""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import AGENT_SLUG, api_get, api_post, check_env, get_agent_id, output

check_env()

ap = argparse.ArgumentParser()
ap.add_argument("--connection-id", required=True, help="source_connections.id UUID")
ap.add_argument("--action", required=True, help="Action name (e.g. create_item)")
ap.add_argument("--params", required=True, help="JSON object of action parameters")
args = ap.parse_args()

try:
    params = json.loads(args.params)
except json.JSONDecodeError as e:
    output({"error": "invalid_params_json", "detail": str(e)})
    sys.exit(1)

conn = api_get(
    "source_connections",
    {
        "select": "id,provider,writable,status",
        "id": f"eq.{args.connection_id}",
        "limit": "1",
    },
)
if not conn:
    output({"error": "connection_not_found", "connection_id": args.connection_id})
    sys.exit(1)
conn = conn[0]

if not conn.get("writable"):
    output(
        {
            "error": "connection_not_writable",
            "provider": conn["provider"],
            "message": f"This {conn['provider']} connection is read-only. Create a knowledge page instead.",
        }
    )
    sys.exit(1)

if conn.get("status") != "active":
    output({"error": "connection_not_active", "status": conn["status"]})
    sys.exit(1)

agent_id = get_agent_id()
agent_row = api_get("agents", {"select": "gateway_id", "id": f"eq.{agent_id}", "limit": "1"}) if agent_id else []
gateway_id = agent_row[0]["gateway_id"] if agent_row else None

cmd_payload = {
    "agent_id": agent_id,
    "agent_slug": AGENT_SLUG,
    "action": "source_write",
    "payload": {
        "connection_id": args.connection_id,
        "action": args.action,
        "params": params,
    },
}
if gateway_id:
    cmd_payload["gateway_id"] = gateway_id

result = api_post("agent_commands", cmd_payload)
cmd = result[0] if isinstance(result, list) else result
cmd_id = cmd["id"]

POLL_INTERVAL = 2
TIMEOUT = 60
elapsed = 0
while elapsed < TIMEOUT:
    time.sleep(POLL_INTERVAL)
    elapsed += POLL_INTERVAL

    rows = api_get(
        "agent_commands",
        {
            "select": "status,stdout,stderr,error_message,exit_code",
            "id": f"eq.{cmd_id}",
            "limit": "1",
        },
    )
    if not rows:
        continue
    row = rows[0]

    if row["status"] == "completed":
        result_data = None
        if row.get("stdout"):
            try:
                result_data = json.loads(row["stdout"])
            except json.JSONDecodeError:
                result_data = row["stdout"]
        output({"status": "completed", "command_id": cmd_id, "result": result_data})
        sys.exit(0)

    if row["status"] == "failed":
        output(
            {
                "status": "failed",
                "command_id": cmd_id,
                "error": row.get("error_message") or row.get("stderr"),
            }
        )
        sys.exit(1)

output(
    {
        "status": "timeout",
        "command_id": cmd_id,
        "message": f"Command did not complete within {TIMEOUT}s. Check status manually.",
    }
)
sys.exit(1)
