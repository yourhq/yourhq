#!/usr/bin/env python3
"""Link a contact to an organization."""
import argparse, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_post, audit, AGENT_SLUG, output
check_env()

ap = argparse.ArgumentParser()
ap.add_argument("contact_id")
ap.add_argument("org_id")
ap.add_argument("--role", default=None)
ap.add_argument("--is-current", type=bool, default=True)
args = ap.parse_args()

payload = {
    "contact_id": args.contact_id,
    "org_id": args.org_id,
    "role": args.role,
    "is_current": args.is_current,
}
result = api_post("contact_organizations", payload)
row = result[0] if isinstance(result, list) else result
audit("crm", "contact_organization", row["id"], "created",
      summary=f"Agent '{AGENT_SLUG}' linked contact to organization")
output({"status": "linked", "id": row["id"], "contact_id": args.contact_id, "org_id": args.org_id})