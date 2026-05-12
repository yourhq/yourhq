from __future__ import annotations

import json
import urllib.request

NOTION_VERSION = "2022-06-28"
NOTION_API = "https://api.notion.com/v1"


def headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def request(
    method: str,
    url: str,
    api_key: str,
    data: dict | None = None,
    timeout: int = 30,
) -> dict:
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers(api_key), method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def get(url: str, api_key: str, timeout: int = 30) -> dict:
    return request("GET", url, api_key, timeout=timeout)


def post(url: str, api_key: str, data: dict, timeout: int = 30) -> dict:
    return request("POST", url, api_key, data=data, timeout=timeout)
