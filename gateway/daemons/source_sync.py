#!/usr/bin/env python3
"""
Source Sync Daemon

Periodically checks source_connections for connections due for sync
(next_sync_at <= now, status='active'), fetches content from the
external provider, and upserts knowledge_items with kind='source'.

Currently supports:
  - Notion: reads pages shared with the integration
  - Google Drive: placeholder (requires OAuth, deferred)

Environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Optional:
  SOURCE_SYNC_POLL_INTERVAL — seconds between poll cycles (default: 60)

Run:
  python3 /app/source_sync.py
"""

import json
import os
import sys
import time
import traceback
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

try:
    from registry_config import resolve as resolve_hq_config
except ImportError:
    resolve_hq_config = None  # type: ignore[assignment]

SUPABASE_URL = ""
SUPABASE_KEY = ""
POLL_INTERVAL = int(os.environ.get("SOURCE_SYNC_POLL_INTERVAL", "60"))


def log(msg: str) -> None:
    print(f"[source_sync] {msg}", flush=True)


def supabase_request(
    method: str, path: str, data: dict | list | None = None, params: dict | None = None
) -> dict | list | None:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode()
        return json.loads(text) if text.strip() else None


def supabase_rpc(fn_name: str, params: dict) -> dict | list | None:
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    data = json.dumps(params).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read().decode()
        return json.loads(body) if body.strip() else None


def fetch_due_connections() -> list[dict]:
    now = datetime.now(timezone.utc).isoformat()
    result = supabase_request(
        "GET",
        "source_connections",
        params={
            "status": "eq.active",
            "next_sync_at": f"lte.{now}",
            "select": "*",
            "order": "next_sync_at.asc",
            "limit": "5",
        },
    )
    return result if isinstance(result, list) else []


def create_sync_run(connection_id: str) -> str | None:
    result = supabase_request(
        "POST",
        "source_sync_runs",
        data={"connection_id": connection_id, "status": "running"},
    )
    if isinstance(result, list) and result:
        return result[0]["id"]
    return None


def complete_sync_run(run_id: str, items_synced: int, items_failed: int, error: str | None = None) -> None:
    updates: dict = {
        "status": "failed" if error else "done",
        "items_synced": items_synced,
        "items_failed": items_failed,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        updates["error_message"] = error[:500]

    supabase_request("PATCH", f"source_sync_runs?id=eq.{run_id}", data=updates)


def update_connection_next_sync(connection_id: str, interval_hours: int, error: str | None = None) -> None:
    next_sync = datetime.now(timezone.utc) + timedelta(hours=interval_hours)
    updates: dict = {
        "next_sync_at": next_sync.isoformat(),
        "last_verified_at": datetime.now(timezone.utc).isoformat(),
    }
    if error:
        updates["status"] = "error"
        updates["error_message"] = error[:500]
    else:
        updates["status"] = "active"
        updates["error_message"] = None

    supabase_request("PATCH", f"source_connections?id=eq.{connection_id}", data=updates)


def sync_notion(connection: dict) -> tuple[int, int, str | None]:
    api_key = connection.get("credentials", {}).get("api_key", "")
    if not api_key:
        return 0, 0, "No API key configured"

    connection_id = connection["id"]

    try:
        req = urllib.request.Request(
            "https://api.notion.com/v1/search",
            data=json.dumps({"filter": {"property": "object", "value": "page"}, "page_size": 100}).encode(),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
    except Exception as e:
        return 0, 0, f"Notion API error: {e}"

    pages = body.get("results", [])
    synced = 0
    failed = 0

    for page in pages:
        page_id = page.get("id", "")
        title_parts = []
        for prop in page.get("properties", {}).values():
            if prop.get("type") == "title":
                for t in prop.get("title", []):
                    title_parts.append(t.get("plain_text", ""))
        title = "".join(title_parts) or "Untitled"

        plain_text = fetch_notion_page_content(api_key, page_id)

        existing = supabase_request(
            "GET",
            "knowledge_items",
            params={
                "source_connection_id": f"eq.{connection_id}",
                "source_external_id": f"eq.{page_id}",
                "select": "id",
                "limit": "1",
            },
        )

        try:
            if isinstance(existing, list) and existing:
                supabase_request(
                    "PATCH",
                    f"knowledge_items?id=eq.{existing[0]['id']}",
                    data={
                        "title": title,
                        "plain_text": plain_text,
                        "source_sync_status": "synced",
                        "source_synced_at": datetime.now(timezone.utc).isoformat(),
                        "embedding_status": "pending",
                    },
                )
            else:
                supabase_request(
                    "POST",
                    "knowledge_items",
                    data={
                        "kind": "source",
                        "title": title,
                        "plain_text": plain_text,
                        "scope": "workspace",
                        "source_connection_id": connection_id,
                        "source_external_id": page_id,
                        "source_sync_status": "synced",
                        "source_synced_at": datetime.now(timezone.utc).isoformat(),
                        "embedding_status": "pending",
                        "processing_status": "done",
                    },
                )
            synced += 1
        except Exception as e:
            log(f"  Failed to upsert page '{title}': {e}")
            failed += 1

    return synced, failed, None


def fetch_notion_page_content(api_key: str, page_id: str) -> str:
    try:
        req = urllib.request.Request(
            f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Notion-Version": "2022-06-28",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode())
    except Exception:
        return ""

    texts = []
    for block in body.get("results", []):
        block_type = block.get("type", "")
        block_data = block.get(block_type, {})
        if isinstance(block_data, dict):
            rich_texts = block_data.get("rich_text", [])
            for rt in rich_texts:
                t = rt.get("plain_text", "")
                if t:
                    texts.append(t)

    return "\n".join(texts)


def sync_connection(connection: dict) -> None:
    provider = connection["provider"]
    label = connection["account_label"]
    connection_id = connection["id"]
    interval = connection.get("sync_interval_hours", 6)

    log(f"Syncing {provider} connection '{label}'")

    run_id = create_sync_run(connection_id)
    if not run_id:
        log(f"  Failed to create sync run")
        return

    if provider == "notion":
        synced, failed, error = sync_notion(connection)
    elif provider == "google_drive":
        synced, failed, error = 0, 0, "Google Drive sync not yet implemented"
    else:
        synced, failed, error = 0, 0, f"Unknown provider: {provider}"

    complete_sync_run(run_id, synced, failed, error)
    update_connection_next_sync(connection_id, interval, error)

    if error:
        log(f"  Sync failed: {error}")
    else:
        log(f"  Synced {synced} items, {failed} failed")


def poll_cycle() -> int:
    connections = fetch_due_connections()
    if not connections:
        return 0

    for conn in connections:
        try:
            sync_connection(conn)
        except Exception:
            log(f"  Unexpected error: {traceback.format_exc()}")

    return len(connections)


def resolve_config() -> bool:
    global SUPABASE_URL, SUPABASE_KEY
    SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
    SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

    if not SUPABASE_URL and resolve_hq_config:
        cfg = resolve_hq_config()
        if cfg:
            SUPABASE_URL = cfg.supabase_url or ""
            SUPABASE_KEY = cfg.service_role_key or ""

    return bool(SUPABASE_URL and SUPABASE_KEY)


def main() -> None:
    log("Starting source sync daemon")
    log(f"  poll interval: {POLL_INTERVAL}s")

    while not resolve_config():
        log("No Supabase credentials yet, retrying in 10s...")
        time.sleep(10)

    log(f"Connected to {SUPABASE_URL}")

    while True:
        try:
            poll_cycle()
        except Exception:
            log(f"Poll cycle error: {traceback.format_exc()}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
