from __future__ import annotations

from .base import BaseConnector

CONNECTORS: dict[str, BaseConnector] = {}


def _register_connectors() -> None:
    from .notion import NotionConnector

    CONNECTORS["notion"] = NotionConnector()

    # Google Drive — Phase 6
    # from .google_drive import GoogleDriveConnector
    # CONNECTORS["google_drive"] = GoogleDriveConnector()


def get_connector(provider: str) -> BaseConnector | None:
    if not CONNECTORS:
        _register_connectors()
    return CONNECTORS.get(provider)
