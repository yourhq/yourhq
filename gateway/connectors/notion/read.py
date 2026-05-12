from __future__ import annotations

from datetime import datetime
from typing import Any

from ..base import (
    BaseConnector,
    BrowseResult,
    ChangesResult,
    SourceContent,
    SourceItem,
)
from .api import NOTION_API, get, post
from .transforms import (
    extract_properties,
    fetch_block_children,
    page_title,
    page_url,
    parse_iso,
    render_blocks,
    rich_text_to_str,
)


class NotionConnector(BaseConnector):
    def _key(self, creds: dict) -> str:
        return creds.get("api_key", "")

    def validate_credentials(self, creds: dict) -> bool:
        api_key = self._key(creds)
        if not api_key:
            return False
        try:
            get(f"{NOTION_API}/users/me", api_key)
            return True
        except Exception:
            return False

    def browse(
        self,
        creds: dict,
        parent_id: str | None = None,
        search: str | None = None,
    ) -> BrowseResult:
        api_key = self._key(creds)

        if search:
            return self._search(api_key, search)

        if parent_id:
            return self._browse_children(api_key, parent_id)

        return self._browse_top_level(api_key)

    def _search(self, api_key: str, query: str) -> BrowseResult:
        resp = post(
            f"{NOTION_API}/search",
            api_key,
            {"query": query, "page_size": 30},
        )
        items = [self._result_to_item(r) for r in resp.get("results", [])]
        return BrowseResult(items=[i for i in items if i is not None])

    def _browse_top_level(self, api_key: str) -> BrowseResult:
        resp = post(
            f"{NOTION_API}/search",
            api_key,
            {
                "filter": {"property": "object", "value": "page"},
                "sort": {"direction": "descending", "timestamp": "last_edited_time"},
                "page_size": 100,
            },
        )
        items: list[SourceItem] = []
        for r in resp.get("results", []):
            item = self._result_to_item(r)
            if item and not r.get("parent", {}).get("page_id"):
                items.append(item)
        return BrowseResult(items=items)

    def _browse_children(self, api_key: str, parent_id: str) -> BrowseResult:
        blocks = fetch_block_children(api_key, parent_id)
        items: list[SourceItem] = []
        for block in blocks:
            btype = block.get("type", "")
            if btype == "child_page":
                title = block.get("child_page", {}).get("title", "Untitled")
                items.append(
                    SourceItem(
                        external_id=block["id"],
                        title=title,
                        source_url=page_url(block["id"]),
                        item_type="page",
                        has_children=block.get("has_children", False),
                        parent_id=parent_id,
                    )
                )
            elif btype == "child_database":
                title = block.get("child_database", {}).get("title", "Untitled database")
                items.append(
                    SourceItem(
                        external_id=block["id"],
                        title=title,
                        source_url=page_url(block["id"]),
                        item_type="database",
                        has_children=True,
                        parent_id=parent_id,
                    )
                )
        return BrowseResult(items=items)

    def _result_to_item(self, result: dict) -> SourceItem | None:
        obj_type = result.get("object")
        if obj_type == "page":
            return SourceItem(
                external_id=result["id"],
                title=page_title(result),
                source_url=page_url(result["id"]),
                item_type="page",
                last_modified=parse_iso(result.get("last_edited_time")),
                parent_id=result.get("parent", {}).get("page_id"),
                has_children=True,
                meta={"icon": result.get("icon")},
            )
        elif obj_type == "database":
            title_parts = result.get("title", [])
            title = rich_text_to_str(title_parts) if title_parts else "Untitled database"
            return SourceItem(
                external_id=result["id"],
                title=title,
                source_url=page_url(result["id"]),
                item_type="database",
                last_modified=parse_iso(result.get("last_edited_time")),
                has_children=True,
            )
        return None

    def list_items(self, creds: dict, external_ids: list[str]) -> list[SourceItem]:
        api_key = self._key(creds)
        items: list[SourceItem] = []
        for eid in external_ids:
            try:
                page = get(f"{NOTION_API}/pages/{eid}", api_key)
                item = self._result_to_item(page)
                if item:
                    items.append(item)
            except Exception:
                pass
        return items

    def fetch_item(self, creds: dict, external_id: str) -> SourceContent:
        api_key = self._key(creds)
        page = get(f"{NOTION_API}/pages/{external_id}", api_key)
        title = page_title(page)
        properties = extract_properties(page)

        blocks = fetch_block_children(api_key, external_id)
        markdown = render_blocks(api_key, blocks)

        if properties:
            prop_lines = []
            for k, v in properties.items():
                if isinstance(v, list):
                    v = ", ".join(str(x) for x in v)
                prop_lines.append(f"- **{k}**: {v}")
            prop_section = "\n".join(prop_lines)
            markdown = f"{prop_section}\n\n---\n\n{markdown}"

        return SourceContent(
            markdown=markdown.strip(),
            title=title,
            source_url=page_url(external_id),
            properties=properties,
        )

    def detect_changes(
        self,
        creds: dict,
        since: datetime,
        known_ids: list[str],
    ) -> ChangesResult:
        api_key = self._key(creds)
        if not known_ids:
            return ChangesResult()

        modified: list[str] = []
        found_ids: set[str] = set()

        start_cursor: str | None = None
        pages_checked = 0
        while pages_checked < 10:
            payload: dict[str, Any] = {
                "filter": {"property": "object", "value": "page"},
                "sort": {"direction": "descending", "timestamp": "last_edited_time"},
                "page_size": 100,
            }
            if start_cursor:
                payload["start_cursor"] = start_cursor

            resp = post(f"{NOTION_API}/search", api_key, payload)
            results = resp.get("results", [])

            for page in results:
                pid = page["id"]
                if pid not in known_ids:
                    found_ids.add(pid)
                    continue
                found_ids.add(pid)
                edited = parse_iso(page.get("last_edited_time"))
                if edited and edited > since:
                    modified.append(pid)

            if not resp.get("has_more"):
                break
            start_cursor = resp.get("next_cursor")
            pages_checked += 1

        known_set = set(known_ids)
        deleted = [eid for eid in known_set if eid not in found_ids]

        return ChangesResult(modified=modified, deleted=deleted)
