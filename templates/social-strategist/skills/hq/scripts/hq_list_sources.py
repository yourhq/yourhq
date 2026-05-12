#!/usr/bin/env python3
"""List connected external sources and their sync status."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from hq_base import api_get, check_env, output

check_env()

connections = (
    api_get(
        "source_connections",
        {
            "select": "id,provider,account_label,writable,status,meta,updated_at",
            "status": "eq.active",
            "order": "provider.asc,account_label.asc",
        },
    )
    or []
)

results = []
for conn in connections:
    items = (
        api_get(
            "knowledge_items",
            {
                "select": "id",
                "source_connection_id": f"eq.{conn['id']}",
                "archived_at": "is.null",
            },
        )
        or []
    )

    last_sync = None
    sync_runs = api_get(
        "source_sync_runs",
        {
            "select": "completed_at",
            "connection_id": f"eq.{conn['id']}",
            "status": "eq.done",
            "order": "completed_at.desc",
            "limit": "1",
        },
    )
    if sync_runs:
        last_sync = sync_runs[0].get("completed_at")

    results.append(
        {
            "id": conn["id"],
            "provider": conn["provider"],
            "account_label": conn["account_label"],
            "writable": conn.get("writable", False),
            "synced_item_count": len(items),
            "last_synced_at": last_sync,
        }
    )

output({"connections": results, "count": len(results)})
