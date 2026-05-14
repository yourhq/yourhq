"""Stubs for Supabase HTTP helpers used by daemon modules."""

from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class FakeApiResponder:
    """Drop-in for api_get / api_rpc / api_patch used by daemons.

    Configure per-table and per-RPC responses, then monkeypatch the daemon module.
    All calls are recorded in ``calls`` for assertion.
    """

    tables: dict[str, list | dict | None] = field(default_factory=dict)
    rpcs: dict[str, list | dict | None] = field(default_factory=dict)
    calls: list[tuple[str, str, dict | None]] = field(default_factory=list)
    patches: list[tuple[str, dict]] = field(default_factory=list)

    def api_get(self, path: str, params: dict | None = None) -> list | dict | None:
        self.calls.append(("GET", path, params))
        table = path.split("?")[0].strip("/").split("/")[-1]
        return self.tables.get(table)

    def api_rpc(self, fn_name: str, params: dict | None = None) -> list | dict | None:
        self.calls.append(("RPC", fn_name, params))
        return self.rpcs.get(fn_name)

    def api_patch(self, path: str, data: dict | None = None) -> list | dict | None:
        self.patches.append((path, data or {}))
        self.calls.append(("PATCH", path, data))
        return None
