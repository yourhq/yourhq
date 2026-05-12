"""HQ Plugin SDK — base classes and types for local plugins.

Local plugins subclass BasePlugin and implement on_event().
Webhook plugins don't use this module — they receive HTTP POSTs.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class PluginEvent:
    event_id: str
    event_type: str
    occurred_at: str
    tenant_id: str
    entity_type: str | None = None
    entity_id: str | None = None
    payload: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class PluginResponse:
    data: dict | None = None
    log_message: str | None = None


class StateClient:
    """Scoped key-value store backed by hq_plugin_state."""

    def __init__(self, plugin_id: str, tenant_id: str, supabase_url: str, supabase_key: str):
        self._plugin_id = plugin_id
        self._tenant_id = tenant_id
        self._url = supabase_url.rstrip("/")
        self._key = supabase_key

    def _headers(self) -> dict:
        return {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def get(self, key: str, scope_kind: str = "global", scope_id: str | None = None) -> Any:
        params = {
            "plugin_id": f"eq.{self._plugin_id}",
            "tenant_id": f"eq.{self._tenant_id}",
            "scope_kind": f"eq.{scope_kind}",
            "scope_id": f"eq.{scope_id or ''}",
            "state_key": f"eq.{key}",
            "select": "state_value",
            "limit": "1",
        }

        url = f"{self._url}/rest/v1/hq_plugin_state?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                rows = json.loads(r.read().decode())
                return rows[0]["state_value"] if rows else None
        except Exception:
            return None

    def set(self, key: str, value: Any, scope_kind: str = "global", scope_id: str | None = None) -> None:
        body = {
            "plugin_id": self._plugin_id,
            "tenant_id": self._tenant_id,
            "scope_kind": scope_kind,
            "scope_id": scope_id or "",
            "state_key": key,
            "state_value": json.dumps(value) if not isinstance(value, str) else value,
        }
        url = f"{self._url}/rest/v1/hq_plugin_state?on_conflict=tenant_id,plugin_id,scope_kind,scope_id,state_key"
        data = json.dumps(body).encode()
        req = urllib.request.Request(
            url,
            data=data,
            method="POST",
            headers={**self._headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        try:
            urllib.request.urlopen(req, timeout=10)
        except Exception:
            pass

    def delete(self, key: str, scope_kind: str = "global", scope_id: str | None = None) -> None:
        params = {
            "plugin_id": f"eq.{self._plugin_id}",
            "tenant_id": f"eq.{self._tenant_id}",
            "scope_kind": f"eq.{scope_kind}",
            "scope_id": f"eq.{scope_id or ''}",
            "state_key": f"eq.{key}",
        }

        url = f"{self._url}/rest/v1/hq_plugin_state?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, method="DELETE", headers=self._headers())
        try:
            urllib.request.urlopen(req, timeout=10)
        except Exception:
            pass


class SecretsClient:
    """Read-only access to HQ secrets for the current gateway."""

    def __init__(self, tenant_id: str, gateway_id: str):
        self._tenant_id = tenant_id
        self._gateway_id = gateway_id
        self._secrets_dir = os.path.expanduser("~/.openclaw/secrets")

    def resolve(self, key: str) -> str | None:
        env_path = os.path.join(self._secrets_dir, "gateway.env")
        try:
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(f"{key}="):
                        return line[len(key) + 1 :].strip("'\"")
        except FileNotFoundError:
            pass
        return os.environ.get(key)


class SupabaseClient:
    """Read-only Supabase access for plugins that need to query HQ data."""

    def __init__(self, supabase_url: str, supabase_key: str, tenant_id: str):
        self._url = supabase_url.rstrip("/")
        self._key = supabase_key
        self._tenant_id = tenant_id

    def query(self, table: str, params: dict | None = None) -> list[dict]:
        query_params = dict(params or {})
        query_params.setdefault("tenant_id", f"eq.{self._tenant_id}")
        url = f"{self._url}/rest/v1/{table}?{urllib.parse.urlencode(query_params)}"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": self._key,
                "Authorization": f"Bearer {self._key}",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read().decode())
        except Exception:
            return []


@dataclass
class PluginContext:
    config: dict
    state: StateClient
    secrets: SecretsClient
    supabase: SupabaseClient
    logger: logging.Logger


class BasePlugin(ABC):
    """Base class for local HQ plugins."""

    def __init__(self, ctx: PluginContext):
        self.ctx = ctx

    @abstractmethod
    def on_event(self, event: PluginEvent) -> PluginResponse | None: ...

    def on_configure(self, new_config: dict) -> None:
        self.ctx.config = new_config

    def health(self) -> dict:
        return {"status": "ok"}

    def on_shutdown(self) -> None:
        pass
