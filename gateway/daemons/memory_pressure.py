"""Memory-aware batch sizing for gateway daemons.

Reads available system memory and computes a safe batch size so bulk
operations don't OOM small instances.  Uses /proc/meminfo on Linux
(the container runtime) with a graceful fallback that returns the
configured max when the file is unavailable (macOS dev, exotic OS).
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

# Thresholds (bytes)
_CRITICAL_MB = int(os.environ.get("HQ_MEMORY_CRITICAL_MB", "256"))
_LOW_MB = int(os.environ.get("HQ_MEMORY_LOW_MB", "512"))
_COMFORTABLE_MB = int(os.environ.get("HQ_MEMORY_COMFORTABLE_MB", "1024"))

CRITICAL_BYTES = _CRITICAL_MB * 1024 * 1024
LOW_BYTES = _LOW_MB * 1024 * 1024
COMFORTABLE_BYTES = _COMFORTABLE_MB * 1024 * 1024

# Backoff when critically low
PRESSURE_BACKOFF_SECONDS = int(os.environ.get("HQ_MEMORY_BACKOFF_SECONDS", "30"))

_last_notification_time: float = 0
_NOTIFICATION_COOLDOWN = 600  # 10 minutes between notifications


def get_available_memory_bytes() -> int | None:
    """Return available memory in bytes, or None if unreadable."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) * 1024  # /proc/meminfo reports in kB
    except (OSError, ValueError, IndexError):
        pass
    return None


def compute_batch_size(configured_max: int) -> int:
    """Return a batch size between 1 and configured_max based on memory."""
    available = get_available_memory_bytes()
    if available is None:
        return configured_max

    if available < CRITICAL_BYTES:
        return 0  # signal: skip this cycle entirely
    if available < LOW_BYTES:
        return 1
    if available < COMFORTABLE_BYTES:
        return max(1, configured_max // 2)
    return configured_max


def should_backoff() -> bool:
    """Return True if memory is critically low and the daemon should sleep."""
    available = get_available_memory_bytes()
    if available is None:
        return False
    return available < CRITICAL_BYTES


def emit_pressure_notification(
    daemon_name: str,
    supabase_url: str,
    supabase_key: str,
    available_mb: int,
) -> None:
    """Create a dashboard notification when indexing is paused due to memory."""
    global _last_notification_time
    now = time.monotonic()
    if now - _last_notification_time < _NOTIFICATION_COOLDOWN:
        return
    _last_notification_time = now

    if not supabase_url or not supabase_key:
        return

    tenant_id = os.environ.get("TENANT_ID", "00000000-0000-0000-0000-000000000000")
    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "type": "system",
        "title": f"{daemon_name.replace('_', ' ').title()} paused — low memory",
        "body": (
            f"Only {available_mb} MB of RAM available. "
            f"Processing is throttled to prevent the system from becoming unresponsive. "
            f"Consider reducing batch sizes or adding more memory."
        ),
        "entity_type": "gateway",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    url = supabase_url.rstrip("/") + "/rest/v1/notifications"
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        urllib.request.urlopen(request, timeout=10)
    except (urllib.error.URLError, OSError):
        pass
