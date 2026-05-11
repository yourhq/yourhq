from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class SourceItem:
    external_id: str
    title: str
    source_url: str
    item_type: str  # 'page', 'database', 'file', 'folder'
    last_modified: datetime | None = None
    parent_id: str | None = None
    has_children: bool = False
    meta: dict = field(default_factory=dict)


@dataclass
class SourceContent:
    markdown: str
    title: str
    source_url: str
    properties: dict = field(default_factory=dict)
    mime_type: str | None = None
    raw_bytes: bytes | None = None

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.markdown.encode()).hexdigest()


@dataclass
class BrowseResult:
    items: list[SourceItem] = field(default_factory=list)


@dataclass
class ChangesResult:
    modified: list[str] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)
    cursor: str | None = None


class BaseConnector(ABC):
    @abstractmethod
    def validate_credentials(self, creds: dict) -> bool:
        """Test that stored credentials are valid. Raises on failure."""
        ...

    @abstractmethod
    def browse(
        self,
        creds: dict,
        parent_id: str | None = None,
        search: str | None = None,
    ) -> BrowseResult:
        """List items for the picker UI. If search is set, return matching
        items across the whole workspace. If parent_id is set, return children
        of that item. If neither, return top-level items."""
        ...

    @abstractmethod
    def list_items(self, creds: dict, external_ids: list[str]) -> list[SourceItem]:
        """Return metadata for specific items by external ID."""
        ...

    @abstractmethod
    def fetch_item(self, creds: dict, external_id: str) -> SourceContent:
        """Fetch full content for a single item and render to markdown."""
        ...

    @abstractmethod
    def detect_changes(
        self,
        creds: dict,
        since: datetime,
        known_ids: list[str],
    ) -> ChangesResult:
        """Return IDs of items modified after *since*, and IDs that were
        deleted (present in known_ids but no longer in the source)."""
        ...


# ── Write support ─────────────────────────────────────────────────


@dataclass
class ActionDefinition:
    name: str
    label: str
    description: str
    parameters: dict = field(default_factory=dict)


class BaseActionProvider(ABC):
    @abstractmethod
    def list_actions(self) -> list[ActionDefinition]:
        """Return the actions this provider supports."""
        ...

    @abstractmethod
    def execute(self, action: str, params: dict, creds: dict) -> dict:
        """Execute a named action. Returns a result dict."""
        ...
