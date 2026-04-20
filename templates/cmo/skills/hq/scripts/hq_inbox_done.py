#!/usr/bin/env python3
"""Mark an inbox item as done."""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import check_env, api_rpc, output

check_env()

if len(sys.argv) < 2:
    print("Usage: hq_inbox_done.py INBOX_ITEM_ID", file=sys.stderr)
    sys.exit(1)

item_id = sys.argv[1]
api_rpc("complete_inbox_item", {"p_item_id": item_id})
output({"status": "done", "inbox_item_id": item_id})
