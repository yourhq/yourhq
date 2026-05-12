from __future__ import annotations

import importlib
import os

from .base import BaseActionProvider, BaseConnector

CONNECTORS: dict[str, BaseConnector] = {}
ACTION_PROVIDERS: dict[str, BaseActionProvider] = {}

_discovered = False


def _discover() -> None:
    global _discovered
    if _discovered:
        return
    _discovered = True

    connectors_dir = os.path.dirname(os.path.abspath(__file__))
    for name in sorted(os.listdir(connectors_dir)):
        if name.startswith("_"):
            continue
        path = os.path.join(connectors_dir, name)
        if not os.path.isdir(path):
            continue
        if not os.path.isfile(os.path.join(path, "__init__.py")):
            continue
        try:
            mod = importlib.import_module(f".{name}", package=__package__)
            connector = getattr(mod, "CONNECTOR", None)
            if connector and isinstance(connector, BaseConnector):
                CONNECTORS[name] = connector
            action_provider = getattr(mod, "ACTION_PROVIDER", None)
            if action_provider and isinstance(action_provider, BaseActionProvider):
                ACTION_PROVIDERS[name] = action_provider
        except Exception as e:
            print(f"[registry] Failed to load connector '{name}': {e}")


def get_connector(provider: str) -> BaseConnector | None:
    _discover()
    return CONNECTORS.get(provider)


def get_action_provider(provider: str) -> BaseActionProvider | None:
    _discover()
    return ACTION_PROVIDERS.get(provider)
