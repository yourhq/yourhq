from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any

from .base import (
    BaseConnector,
    BrowseResult,
    ChangesResult,
    SourceContent,
    SourceItem,
)

NOTION_VERSION = "2022-06-28"
NOTION_API = "https://api.notion.com/v1"


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _request(
    method: str,
    url: str,
    api_key: str,
    data: dict | None = None,
    timeout: int = 30,
) -> dict:
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=_headers(api_key), method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def _get(url: str, api_key: str, timeout: int = 30) -> dict:
    return _request("GET", url, api_key, timeout=timeout)


def _post(url: str, api_key: str, data: dict, timeout: int = 30) -> dict:
    return _request("POST", url, api_key, data=data, timeout=timeout)


# ── Rich text helpers ──────────────────────────────────────────────


def _rich_text_to_str(rich_texts: list[dict]) -> str:
    parts = []
    for rt in rich_texts:
        text = rt.get("plain_text", "")
        annotations = rt.get("annotations", {})
        if annotations.get("code"):
            text = f"`{text}`"
        if annotations.get("bold"):
            text = f"**{text}**"
        if annotations.get("italic"):
            text = f"*{text}*"
        if annotations.get("strikethrough"):
            text = f"~~{text}~~"
        href = rt.get("href")
        if href:
            text = f"[{text}]({href})"
        parts.append(text)
    return "".join(parts)


# ── Page title / URL helpers ───────────────────────────────────────


def _page_title(page: dict) -> str:
    for prop in page.get("properties", {}).values():
        if prop.get("type") == "title":
            return _rich_text_to_str(prop.get("title", []))
    return "Untitled"


def _page_url(page_id: str) -> str:
    return f"https://notion.so/{page_id.replace('-', '')}"


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ── Property extraction ───────────────────────────────────────────


def _extract_properties(page: dict) -> dict:
    props: dict[str, Any] = {}
    for name, prop in page.get("properties", {}).items():
        ptype = prop.get("type", "")
        if ptype == "title":
            continue
        elif ptype == "rich_text":
            props[name] = _rich_text_to_str(prop.get("rich_text", []))
        elif ptype == "number":
            props[name] = prop.get("number")
        elif ptype == "select":
            sel = prop.get("select")
            props[name] = sel["name"] if sel else None
        elif ptype == "multi_select":
            props[name] = [s["name"] for s in prop.get("multi_select", [])]
        elif ptype == "date":
            d = prop.get("date")
            if d:
                props[name] = d.get("start")
        elif ptype == "checkbox":
            props[name] = prop.get("checkbox")
        elif ptype == "url":
            props[name] = prop.get("url")
        elif ptype == "email":
            props[name] = prop.get("email")
        elif ptype == "phone_number":
            props[name] = prop.get("phone_number")
        elif ptype == "status":
            st = prop.get("status")
            props[name] = st["name"] if st else None
    return {k: v for k, v in props.items() if v is not None}


# ── Block renderer ─────────────────────────────────────────────────


def _fetch_block_children(
    api_key: str, block_id: str, *, max_pages: int = 50
) -> list[dict]:
    blocks: list[dict] = []
    url = f"{NOTION_API}/blocks/{block_id}/children?page_size=100"
    pages_fetched = 0
    while url and pages_fetched < max_pages:
        resp = _get(url, api_key)
        blocks.extend(resp.get("results", []))
        pages_fetched += 1
        if resp.get("has_more"):
            cursor = resp["next_cursor"]
            base = f"{NOTION_API}/blocks/{block_id}/children?page_size=100"
            url = f"{base}&start_cursor={cursor}"
        else:
            url = ""
    return blocks


def _render_blocks(api_key: str, blocks: list[dict], depth: int = 0) -> str:
    lines: list[str] = []
    indent = "  " * depth
    numbered_counter = 0

    for block in blocks:
        btype = block.get("type", "")
        bdata = block.get(btype, {})

        if btype != "numbered_list_item":
            numbered_counter = 0

        if btype in ("paragraph",):
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}{text}")

        elif btype == "heading_1":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"\n{'#' if depth == 0 else '###'} {text}")

        elif btype == "heading_2":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"\n{'##' if depth == 0 else '####'} {text}")

        elif btype == "heading_3":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"\n{'###' if depth == 0 else '#####'} {text}")

        elif btype == "bulleted_list_item":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}- {text}")

        elif btype == "numbered_list_item":
            numbered_counter += 1
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}{numbered_counter}. {text}")

        elif btype == "to_do":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            checked = "x" if bdata.get("checked") else " "
            lines.append(f"{indent}- [{checked}] {text}")

        elif btype == "toggle":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}**{text}**")

        elif btype == "code":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lang = bdata.get("language", "")
            lines.append(f"{indent}```{lang}")
            lines.append(text)
            lines.append(f"{indent}```")

        elif btype == "quote":
            text = _rich_text_to_str(bdata.get("rich_text", []))
            for line in text.split("\n"):
                lines.append(f"{indent}> {line}")

        elif btype == "callout":
            icon = ""
            icon_data = bdata.get("icon", {})
            if icon_data.get("type") == "emoji":
                icon = icon_data.get("emoji", "") + " "
            text = _rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}> {icon}{text}")

        elif btype == "divider":
            lines.append(f"{indent}---")

        elif btype == "table":
            children = _fetch_block_children(api_key, block["id"])
            rows: list[list[str]] = []
            for row_block in children:
                cells = row_block.get("table_row", {}).get("cells", [])
                rows.append([_rich_text_to_str(cell) for cell in cells])
            if rows:
                header = rows[0]
                lines.append(f"{indent}| " + " | ".join(header) + " |")
                lines.append(f"{indent}| " + " | ".join("---" for _ in header) + " |")
                for row in rows[1:]:
                    padded = row + [""] * (len(header) - len(row))
                    lines.append(f"{indent}| " + " | ".join(padded) + " |")

        elif btype == "table_row":
            pass  # handled by parent table

        elif btype == "image":
            caption = _rich_text_to_str(bdata.get("caption", []))
            url = ""
            if bdata.get("type") == "file":
                url = bdata.get("file", {}).get("url", "")
            elif bdata.get("type") == "external":
                url = bdata.get("external", {}).get("url", "")
            label = caption or "Image"
            lines.append(f"{indent}![{label}]({url})")

        elif btype in ("file", "video", "pdf"):
            caption = _rich_text_to_str(bdata.get("caption", []))
            url = ""
            if bdata.get("type") == "file":
                url = bdata.get("file", {}).get("url", "")
            elif bdata.get("type") == "external":
                url = bdata.get("external", {}).get("url", "")
            label = caption or btype.capitalize()
            lines.append(f"{indent}[{label}]({url})")

        elif btype == "bookmark":
            url = bdata.get("url", "")
            caption = _rich_text_to_str(bdata.get("caption", []))
            label = caption or url
            lines.append(f"{indent}[{label}]({url})")

        elif btype == "embed":
            url = bdata.get("url", "")
            lines.append(f"{indent}[Embed]({url})")

        elif btype == "equation":
            expr = bdata.get("expression", "")
            lines.append(f"{indent}$${expr}$$")

        elif btype == "child_page":
            title = bdata.get("title", "Untitled")
            page_url = _page_url(block["id"])
            lines.append(f"{indent}[{title}]({page_url})")

        elif btype == "child_database":
            title = bdata.get("title", "Untitled database")
            db_url = _page_url(block["id"])
            lines.append(f"{indent}[{title}]({db_url})")

        elif btype in ("column_list", "column"):
            pass  # children are fetched below

        elif btype == "synced_block":
            pass  # children are fetched below

        elif btype == "link_to_page":
            page_id = bdata.get("page_id", "")
            if page_id:
                lines.append(f"{indent}[Linked page]({_page_url(page_id)})")

        # Recurse into children
        if block.get("has_children") and btype not in ("table",):
            children = _fetch_block_children(api_key, block["id"])
            child_depth = depth + 1 if btype in (
                "bulleted_list_item", "numbered_list_item", "to_do", "toggle",
            ) else depth
            child_text = _render_blocks(api_key, children, child_depth)
            if child_text.strip():
                lines.append(child_text)

    return "\n".join(lines)


# ── Connector ──────────────────────────────────────────────────────


class NotionConnector(BaseConnector):

    def _key(self, creds: dict) -> str:
        return creds.get("api_key", "")

    # ── validate ───────────────────────────────────────────────────

    def validate_credentials(self, creds: dict) -> bool:
        api_key = self._key(creds)
        if not api_key:
            return False
        try:
            _get(f"{NOTION_API}/users/me", api_key)
            return True
        except Exception:
            return False

    # ── browse ─────────────────────────────────────────────────────

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
        resp = _post(
            f"{NOTION_API}/search",
            api_key,
            {"query": query, "page_size": 30},
        )
        items = [self._result_to_item(r) for r in resp.get("results", [])]
        return BrowseResult(items=[i for i in items if i is not None])

    def _browse_top_level(self, api_key: str) -> BrowseResult:
        resp = _post(
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
        blocks = _fetch_block_children(api_key, parent_id)
        items: list[SourceItem] = []
        for block in blocks:
            btype = block.get("type", "")
            if btype == "child_page":
                title = block.get("child_page", {}).get("title", "Untitled")
                items.append(SourceItem(
                    external_id=block["id"],
                    title=title,
                    source_url=_page_url(block["id"]),
                    item_type="page",
                    has_children=block.get("has_children", False),
                    parent_id=parent_id,
                ))
            elif btype == "child_database":
                title = block.get("child_database", {}).get("title", "Untitled database")
                items.append(SourceItem(
                    external_id=block["id"],
                    title=title,
                    source_url=_page_url(block["id"]),
                    item_type="database",
                    has_children=True,
                    parent_id=parent_id,
                ))
        return BrowseResult(items=items)

    def _result_to_item(self, result: dict) -> SourceItem | None:
        obj_type = result.get("object")
        if obj_type == "page":
            return SourceItem(
                external_id=result["id"],
                title=_page_title(result),
                source_url=_page_url(result["id"]),
                item_type="page",
                last_modified=_parse_iso(result.get("last_edited_time")),
                parent_id=result.get("parent", {}).get("page_id"),
                has_children=True,
                meta={"icon": result.get("icon")},
            )
        elif obj_type == "database":
            title_parts = result.get("title", [])
            title = _rich_text_to_str(title_parts) if title_parts else "Untitled database"
            return SourceItem(
                external_id=result["id"],
                title=title,
                source_url=_page_url(result["id"]),
                item_type="database",
                last_modified=_parse_iso(result.get("last_edited_time")),
                has_children=True,
            )
        return None

    # ── list_items ─────────────────────────────────────────────────

    def list_items(
        self, creds: dict, external_ids: list[str]
    ) -> list[SourceItem]:
        api_key = self._key(creds)
        items: list[SourceItem] = []
        for eid in external_ids:
            try:
                page = _get(f"{NOTION_API}/pages/{eid}", api_key)
                item = self._result_to_item(page)
                if item:
                    items.append(item)
            except Exception:
                pass
        return items

    # ── fetch_item ─────────────────────────────────────────────────

    def fetch_item(self, creds: dict, external_id: str) -> SourceContent:
        api_key = self._key(creds)
        page = _get(f"{NOTION_API}/pages/{external_id}", api_key)
        title = _page_title(page)
        properties = _extract_properties(page)

        blocks = _fetch_block_children(api_key, external_id)
        markdown = _render_blocks(api_key, blocks)

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
            source_url=_page_url(external_id),
            properties=properties,
        )

    # ── detect_changes ─────────────────────────────────────────────

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

        # Fetch all pages sorted by last_edited_time descending
        start_cursor: str | None = None
        pages_checked = 0
        while pages_checked < 10:  # max 10 pages of 100 = 1000 items
            payload: dict[str, Any] = {
                "filter": {"property": "object", "value": "page"},
                "sort": {"direction": "descending", "timestamp": "last_edited_time"},
                "page_size": 100,
            }
            if start_cursor:
                payload["start_cursor"] = start_cursor

            resp = _post(f"{NOTION_API}/search", api_key, payload)
            results = resp.get("results", [])

            for page in results:
                pid = page["id"]
                if pid not in known_ids:
                    found_ids.add(pid)
                    continue
                found_ids.add(pid)
                edited = _parse_iso(page.get("last_edited_time"))
                if edited and edited > since:
                    modified.append(pid)

            if not resp.get("has_more"):
                break
            start_cursor = resp.get("next_cursor")
            pages_checked += 1

        known_set = set(known_ids)
        deleted = [eid for eid in known_set if eid not in found_ids]

        return ChangesResult(modified=modified, deleted=deleted)
