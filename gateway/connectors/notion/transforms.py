from __future__ import annotations

from datetime import datetime
from typing import Any

from .api import NOTION_API, get


def rich_text_to_str(rich_texts: list[dict]) -> str:
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


def page_title(page: dict) -> str:
    for prop in page.get("properties", {}).values():
        if prop.get("type") == "title":
            return rich_text_to_str(prop.get("title", []))
    return "Untitled"


def page_url(page_id: str) -> str:
    return f"https://notion.so/{page_id.replace('-', '')}"


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def extract_properties(page: dict) -> dict:
    props: dict[str, Any] = {}
    for name, prop in page.get("properties", {}).items():
        ptype = prop.get("type", "")
        if ptype == "title":
            continue
        elif ptype == "rich_text":
            props[name] = rich_text_to_str(prop.get("rich_text", []))
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


def fetch_block_children(api_key: str, block_id: str, *, max_pages: int = 50) -> list[dict]:
    blocks: list[dict] = []
    url = f"{NOTION_API}/blocks/{block_id}/children?page_size=100"
    pages_fetched = 0
    while url and pages_fetched < max_pages:
        resp = get(url, api_key)
        blocks.extend(resp.get("results", []))
        pages_fetched += 1
        if resp.get("has_more"):
            cursor = resp["next_cursor"]
            base = f"{NOTION_API}/blocks/{block_id}/children?page_size=100"
            url = f"{base}&start_cursor={cursor}"
        else:
            url = ""
    return blocks


def render_blocks(api_key: str, blocks: list[dict], depth: int = 0) -> str:
    lines: list[str] = []
    indent = "  " * depth
    numbered_counter = 0

    for block in blocks:
        btype = block.get("type", "")
        bdata = block.get(btype, {})

        if btype != "numbered_list_item":
            numbered_counter = 0

        if btype in ("paragraph",):
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}{text}")

        elif btype == "heading_1":
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"\n{'#' if depth == 0 else '###'} {text}")

        elif btype == "heading_2":
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"\n{'##' if depth == 0 else '####'} {text}")

        elif btype == "heading_3":
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"\n{'###' if depth == 0 else '#####'} {text}")

        elif btype == "bulleted_list_item":
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}- {text}")

        elif btype == "numbered_list_item":
            numbered_counter += 1
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}{numbered_counter}. {text}")

        elif btype == "to_do":
            text = rich_text_to_str(bdata.get("rich_text", []))
            checked = "x" if bdata.get("checked") else " "
            lines.append(f"{indent}- [{checked}] {text}")

        elif btype == "toggle":
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}**{text}**")

        elif btype == "code":
            text = rich_text_to_str(bdata.get("rich_text", []))
            lang = bdata.get("language", "")
            lines.append(f"{indent}```{lang}")
            lines.append(text)
            lines.append(f"{indent}```")

        elif btype == "quote":
            text = rich_text_to_str(bdata.get("rich_text", []))
            for line in text.split("\n"):
                lines.append(f"{indent}> {line}")

        elif btype == "callout":
            icon = ""
            icon_data = bdata.get("icon", {})
            if icon_data.get("type") == "emoji":
                icon = icon_data.get("emoji", "") + " "
            text = rich_text_to_str(bdata.get("rich_text", []))
            lines.append(f"{indent}> {icon}{text}")

        elif btype == "divider":
            lines.append(f"{indent}---")

        elif btype == "table":
            children = fetch_block_children(api_key, block["id"])
            rows: list[list[str]] = []
            for row_block in children:
                cells = row_block.get("table_row", {}).get("cells", [])
                rows.append([rich_text_to_str(cell) for cell in cells])
            if rows:
                header = rows[0]
                lines.append(f"{indent}| " + " | ".join(header) + " |")
                lines.append(f"{indent}| " + " | ".join("---" for _ in header) + " |")
                for row in rows[1:]:
                    padded = row + [""] * (len(header) - len(row))
                    lines.append(f"{indent}| " + " | ".join(padded) + " |")

        elif btype == "table_row":
            pass

        elif btype == "image":
            caption = rich_text_to_str(bdata.get("caption", []))
            url = ""
            if bdata.get("type") == "file":
                url = bdata.get("file", {}).get("url", "")
            elif bdata.get("type") == "external":
                url = bdata.get("external", {}).get("url", "")
            label = caption or "Image"
            lines.append(f"{indent}![{label}]({url})")

        elif btype in ("file", "video", "pdf"):
            caption = rich_text_to_str(bdata.get("caption", []))
            url = ""
            if bdata.get("type") == "file":
                url = bdata.get("file", {}).get("url", "")
            elif bdata.get("type") == "external":
                url = bdata.get("external", {}).get("url", "")
            label = caption or btype.capitalize()
            lines.append(f"{indent}[{label}]({url})")

        elif btype == "bookmark":
            url = bdata.get("url", "")
            caption = rich_text_to_str(bdata.get("caption", []))
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
            url = page_url(block["id"])
            lines.append(f"{indent}[{title}]({url})")

        elif btype == "child_database":
            title = bdata.get("title", "Untitled database")
            url = page_url(block["id"])
            lines.append(f"{indent}[{title}]({url})")

        elif btype in ("column_list", "column"):
            pass

        elif btype == "synced_block":
            pass

        elif btype == "link_to_page":
            page_id = bdata.get("page_id", "")
            if page_id:
                lines.append(f"{indent}[Linked page]({page_url(page_id)})")

        if block.get("has_children") and btype not in ("table",):
            children = fetch_block_children(api_key, block["id"])
            child_depth = (
                depth + 1
                if btype
                in (
                    "bulleted_list_item",
                    "numbered_list_item",
                    "to_do",
                    "toggle",
                )
                else depth
            )
            child_text = render_blocks(api_key, children, child_depth)
            if child_text.strip():
                lines.append(child_text)

    return "\n".join(lines)
