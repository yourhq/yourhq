#!/usr/bin/env python3
"""Mark an inbox item as failed. Moves to dead_letter if max attempts reached."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_rpc, check_env, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_inbox_fail.py INBOX_ITEM_ID [reason]", file=sys.stderr)
    sys.exit(1)

item_id = sys.argv[1]
reason = sys.argv[2] if len(sys.argv) > 2 else None

api_rpc("fail_inbox_item", {"p_item_id": item_id, "p_reason": reason})
output({"status": "failed", "inbox_item_id": item_id, "reason": reason})
