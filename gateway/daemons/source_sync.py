#!/usr/bin/env python3
"""
Source Sync Daemon

Periodically checks source_connections for connections due for sync,
uses the connector registry to detect changes, fetch updated content,
and upsert knowledge_items with kind='source'.

Environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  SOURCE_SYNC_POLL_INTERVAL — seconds between poll cycles (default: 60)
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

# Add gateway root to path so connectors package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from connectors import get_connector
from connectors.base import ChangesResult, SourceContent

try:
    from registry_config import resolve as resolve_hq_config
except ImportError:
    resolve_hq_config = None  # type: ignore[assignment]

SUPABASE_URL = ""
SUPABASE_KEY = ""
POLL_INTERVAL = int(os.environ.get("SOURCE_SYNC_POLL_INTERVAL", "60"))


def log(msg: str) -> None:
    print(f"[source_sync] {msg}", flush=True)


# ── Supabase helpers ───────────────────────────────────────────────


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


# ── Sync run tracking ──────────────────────────────────────────────


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


def update_connection_after_sync(connection_id: str, interval_hours: int, error: str | None = None) -> None:
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


# ── Core sync logic ───────────────────────────────────────────────


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


def fetch_synced_items(connection_id: str) -> list[dict]:
    result = supabase_request(
        "GET",
        "knowledge_items",
        params={
            "source_connection_id": f"eq.{connection_id}",
            "archived_at": "is.null",
            "select": "id,source_external_id,source_synced_at,content_hash",
            "limit": "1000",
        },
    )
    return result if isinstance(result, list) else []


def upsert_item(
    connection_id: str,
    external_id: str,
    content: SourceContent,
    existing_item: dict | None,
) -> bool:
    now = datetime.now(timezone.utc).isoformat()
    new_hash = content.content_hash

    if existing_item:
        old_hash = existing_item.get("content_hash")
        if old_hash == new_hash:
            supabase_request(
                "PATCH",
                f"knowledge_items?id=eq.{existing_item['id']}",
                data={
                    "source_sync_status": "synced",
                    "source_synced_at": now,
                },
            )
            return True

        supabase_request(
            "PATCH",
            f"knowledge_items?id=eq.{existing_item['id']}",
            data={
                "title": content.title,
                "plain_text": content.markdown,
                "content_hash": new_hash,
                "meta": content.properties,
                "source_sync_status": "synced",
                "source_synced_at": now,
                "embedding_status": "pending",
                "chunk_status": "pending",
            },
        )
    else:
        supabase_request(
            "POST",
            "knowledge_items",
            data={
                "kind": "source",
                "title": content.title,
                "plain_text": content.markdown,
                "content_hash": new_hash,
                "scope": "workspace",
                "source_connection_id": connection_id,
                "source_external_id": external_id,
                "source_sync_status": "synced",
                "source_synced_at": now,
                "meta": content.properties,
                "embedding_status": "pending",
                "processing_status": "done",
            },
        )
    return True


def mark_deleted(item_id: str) -> None:
    supabase_request(
        "PATCH",
        f"knowledge_items?id=eq.{item_id}",
        data={"source_sync_status": "source_deleted"},
    )


def _load_gateway_secrets() -> dict:
    """Read gateway.env from disk (written by secrets_sync daemon)."""
    from pathlib import Path

    env_file = Path(os.environ.get("OPENCLAW_HOME", os.path.expanduser("~/.openclaw"))) / "secrets" / "gateway.env"
    if not env_file.is_file():
        return {}
    pairs = {}
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        pairs[k.strip()] = v
    return pairs


def _resolve_credentials(provider: str, connection_id: str, creds: dict) -> dict:
    """Merge secrets from gateway.env into the credential dict.

    Supports two naming conventions written by the secrets_sync daemon:
      - Single-key:  {PROVIDER}_SOURCE_{ID_PREFIX}        → injected as ``api_key``
      - Multi-key:   {PROVIDER}_SOURCE_{ID_PREFIX}__{FIELD} → injected as ``{field}`` (lowercase)
    """
    secrets = _load_gateway_secrets()
    prefix = f"{provider.upper()}_SOURCE_{connection_id[:8].upper()}"

    if prefix in secrets and not creds.get("api_key"):
        creds["api_key"] = secrets[prefix]

    multi_prefix = prefix + "__"
    for key, value in secrets.items():
        if key.startswith(multi_prefix):
            field_name = key[len(multi_prefix) :].lower()
            if field_name not in creds:
                creds[field_name] = value

    return creds


def sync_connection(connection: dict) -> None:
    provider = connection["provider"]
    connection_id = connection["id"]
    interval = connection.get("sync_interval_hours", 6)
    creds = _resolve_credentials(provider, connection_id, dict(connection.get("credentials", {})))

    log(f"Syncing {provider} connection")

    connector = get_connector(provider)
    if not connector:
        log(f"  No connector for provider '{provider}'")
        update_connection_after_sync(connection_id, interval, f"Unknown provider: {provider}")
        return

    run_id = create_sync_run(connection_id)
    if not run_id:
        log("  Failed to create sync run")
        return

    synced = 0
    failed = 0
    error: str | None = None

    try:
        existing_items = fetch_synced_items(connection_id)
        item_by_ext_id = {it["source_external_id"]: it for it in existing_items if it.get("source_external_id")}
        known_ids = list(item_by_ext_id.keys())

        if not known_ids:
            log("  No items to sync for this connection")
            complete_sync_run(run_id, 0, 0)
            update_connection_after_sync(connection_id, interval)
            return

        last_synced_at = None
        for it in existing_items:
            ts = it.get("source_synced_at")
            if ts:
                parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                if last_synced_at is None or parsed > last_synced_at:
                    last_synced_at = parsed

        if last_synced_at is None:
            last_synced_at = datetime.now(timezone.utc) - timedelta(days=365)

        changes: ChangesResult = connector.detect_changes(creds, last_synced_at, known_ids)

        for ext_id in changes.deleted:
            item = item_by_ext_id.get(ext_id)
            if item:
                mark_deleted(item["id"])
                log("  Marked deleted item")

        items_to_fetch = changes.modified
        if not items_to_fetch:
            log("  No changes detected")
            complete_sync_run(run_id, 0, 0)
            update_connection_after_sync(connection_id, interval)
            return

        log(f"  {len(items_to_fetch)} items changed, {len(changes.deleted)} deleted")

        for ext_id in items_to_fetch:
            try:
                content = connector.fetch_item(creds, ext_id)
                existing = item_by_ext_id.get(ext_id)
                upsert_item(connection_id, ext_id, content, existing)
                synced += 1
            except Exception as e:
                log(f"  Failed to sync item: {e}")
                failed += 1

    except Exception as e:
        error = str(e)
        log(f"  Sync failed: {error}")

    complete_sync_run(run_id, synced, failed, error)
    update_connection_after_sync(connection_id, interval, error)

    if error:
        log(f"  Sync error: {error}")
    else:
        log(f"  Done: {synced} synced, {failed} failed, {len(changes.deleted)} deleted")


# ── Main loop ──────────────────────────────────────────────────────


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

    log("Connected to Supabase")

    while True:
        try:
            poll_cycle()
        except Exception:
            log(f"Poll cycle error: {traceback.format_exc()}")
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
