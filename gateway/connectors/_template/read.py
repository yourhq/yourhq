from __future__ import annotations

from datetime import datetime

from connectors.base import (
    BaseConnector,
    BrowseResult,
    ChangesResult,
    SourceContent,
    SourceItem,
)


class ExampleConnector(BaseConnector):
    def validate_credentials(self, creds: dict) -> bool:
        api_key = creds["api_key"]
        # Make a lightweight authenticated request to verify the key.
        # Raise an exception with a user-facing message on failure.
        raise NotImplementedError

    def browse(
        self,
        creds: dict,
        parent_id: str | None = None,
        search: str | None = None,
    ) -> BrowseResult:
        # Return items for the content picker UI.
        # - If `search` is set, return matching items across the workspace.
        # - If `parent_id` is set, return children of that container.
        # - If neither, return top-level items.
        raise NotImplementedError

    def list_items(self, creds: dict, external_ids: list[str]) -> list[SourceItem]:
        # Return metadata for specific items. Called during sync to check
        # whether items still exist and to refresh titles/URLs.
        raise NotImplementedError

    def fetch_item(self, creds: dict, external_id: str) -> SourceContent:
        # Fetch full content for one item and render it to markdown.
        # The returned `content_hash` is used to skip re-embedding
        # when content hasn't changed.
        raise NotImplementedError

    def detect_changes(
        self,
        creds: dict,
        since: datetime,
        known_ids: list[str],
    ) -> ChangesResult:
        # Return IDs of items modified after `since`, plus IDs from
        # `known_ids` that no longer exist in the source (deleted).
        raise NotImplementedError
