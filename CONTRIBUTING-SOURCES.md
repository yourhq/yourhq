# Contributing a Source Connector

This guide explains how to add a new source connector to HQ so agents can read (and optionally write) content from an external service.

## How it works

Each source connector is a self-contained folder under `gateway/connectors/<provider>/`. The platform handles everything else — credential encryption, OAuth flows, UI forms, sync scheduling, and embedding. You only write the code that talks to the external API.

```
gateway/connectors/
  _template/          ← copy this to start
  notion/             ← reference implementation
  your_provider/
    __init__.py       ← exports CONNECTOR (and optionally ACTION_PROVIDER)
    manifest.json     ← declarative config: auth, UI metadata, capabilities
    api.py            ← HTTP helpers for the provider's API
    transforms.py     ← convert API responses → markdown + SourceItem fields
    read.py           ← BaseConnector subclass (required)
    write.py          ← BaseActionProvider subclass (optional)
```

## Quick start

```bash
cp -r gateway/connectors/_template gateway/connectors/my_service

# Edit manifest.json with your provider's details
# Implement the connector in read.py
# Run the manifest build script
node scripts/build-source-manifests.mjs
```

## Step 1: manifest.json

The manifest is the contract between your connector and the platform. It tells the UI what to render and how auth works.

```json
{
  "id": "my_service",
  "name": "My Service",
  "description": "Sync documents from My Service.",
  "icon": "M",
  "item_label": "Documents",

  "auth": {
    "type": "api_key",
    "fields": [
      {
        "key": "api_key",
        "label": "API Key",
        "placeholder": "sk-...",
        "input_type": "password",
        "required": true
      }
    ],
    "setup_steps": [
      {
        "title": "Get your API key",
        "description": "Go to My Service settings and copy your API key.",
        "link": { "label": "Open settings", "url": "https://myservice.com/settings" }
      }
    ]
  },

  "source_url_template": "https://myservice.com/doc/{external_id}",
  "supports_write": false
}
```

### Required fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier. Must match the folder name. |
| `name` | Human-readable name shown in the UI. |
| `description` | One-line description for the provider picker. |
| `icon` | Single character or short emoji for the provider icon. |
| `item_label` | What this provider's items are called (e.g., "Pages", "Files"). |
| `auth` | Auth configuration (see below). |
| `auth.type` | `"api_key"` — other types may be added later. |
| `auth.fields` | Array of credential fields the user fills in. |
| `supports_write` | `true` if you implement `write.py`. |

### Optional fields

| Field | Description |
|-------|-------------|
| `source_url_template` | URL pattern with `{external_id}` placeholder. Used to link items back to the source. `{external_id_no_dashes}` strips hyphens. |
| `auth.oauth` | OAuth configuration (see below). |
| `auth.setup_steps` | Guided setup instructions shown to the user. |

### OAuth (optional)

If your provider supports OAuth, add an `oauth` block inside `auth`:

```json
{
  "auth": {
    "type": "api_key",
    "fields": [ ... ],
    "oauth": {
      "authorize_url": "https://myservice.com/oauth/authorize",
      "token_url": "https://myservice.com/oauth/token",
      "token_field": "access_token",
      "scopes": ["read"],
      "env_client_id": "MY_SERVICE_CLIENT_ID",
      "env_client_secret": "MY_SERVICE_CLIENT_SECRET",
      "auth_method": "post_body",
      "extra_params": {},
      "response_mapping": {
        "account_label": "account.name"
      }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `authorize_url` | OAuth authorization endpoint. |
| `token_url` | Token exchange endpoint. |
| `token_field` | Field name in the token response that contains the access token. |
| `scopes` | Array of OAuth scopes to request. |
| `env_client_id` | Environment variable name for the OAuth client ID. |
| `env_client_secret` | Environment variable name for the OAuth client secret. |
| `auth_method` | `"basic"` (HTTP Basic auth for token exchange) or `"post_body"` (credentials in POST body). |
| `extra_params` | Extra query parameters for the authorization URL. |
| `response_mapping` | Dot-notation paths to extract from the token response into connection fields. Keys like `meta.foo` write into the connection's `meta` JSON. Keys like `credentials.bar` are stored encrypted. |

## Step 2: read.py

Subclass `BaseConnector` and implement all five methods:

```python
from connectors.base import (
    BaseConnector, BrowseResult, ChangesResult, SourceContent, SourceItem,
)

class MyServiceConnector(BaseConnector):
    def validate_credentials(self, creds: dict) -> bool:
        # Make a lightweight API call. Raise on failure.
        ...

    def browse(self, creds, parent_id=None, search=None) -> BrowseResult:
        # Return items for the content picker.
        ...

    def list_items(self, creds, external_ids) -> list[SourceItem]:
        # Return metadata for specific items by ID.
        ...

    def fetch_item(self, creds, external_id) -> SourceContent:
        # Fetch full content and render to markdown.
        ...

    def detect_changes(self, creds, since, known_ids) -> ChangesResult:
        # Return modified + deleted item IDs since a timestamp.
        ...
```

### Key types

- **`SourceItem`** — metadata for one item: `external_id`, `title`, `source_url`, `item_type`, `last_modified`, `parent_id`, `has_children`, `meta`.
- **`SourceContent`** — full content: `markdown`, `title`, `source_url`, `properties`, `mime_type`, `raw_bytes`. The `content_hash` property auto-computes from `markdown`.
- **`BrowseResult`** — wrapper with `items: list[SourceItem]`.
- **`ChangesResult`** — `modified: list[str]`, `deleted: list[str]`, optional `cursor`.

### Tips

- Put HTTP helpers in `api.py` and parsing logic in `transforms.py` to keep `read.py` focused on orchestration.
- Use only `urllib.request` for HTTP — no third-party dependencies. The gateway image doesn't install pip packages per connector.
- `creds` is a dict assembled from encrypted secrets. For a single-field `api_key` auth type, it will contain `{"api_key": "..."}`. Multi-field auth provides all fields by their `key`.
- `fetch_item` should return clean markdown. The platform handles chunking and embedding.

## Step 3: __init__.py

```python
from .read import MyServiceConnector

CONNECTOR = MyServiceConnector()
```

The auto-discovery registry scans for directories exporting `CONNECTOR`. That's all that's needed for registration.

## Step 4: Build manifests

```bash
node scripts/build-source-manifests.mjs
```

This generates `apps/ui/src/lib/sources/generated-manifests.ts` — the UI reads this at build time. Commit the generated file alongside your connector.

## Step 5: Test locally

1. Start the gateway: `docker compose --profile gateway up -d`
2. In the UI, go to Settings → Sources → Connect
3. Your provider should appear in the picker
4. Enter credentials and verify the content browser works
5. Select items and trigger a sync
6. Check that synced items appear in Knowledge

## Optional: Write support

If your provider's API supports creating or updating content:

1. Set `"supports_write": true` in `manifest.json`
2. Create `write.py` with a `BaseActionProvider` subclass
3. Export `ACTION_PROVIDER` from `__init__.py`

```python
# write.py
from connectors.base import ActionDefinition, BaseActionProvider

class MyServiceActionProvider(BaseActionProvider):
    def list_actions(self) -> list[ActionDefinition]:
        return [
            ActionDefinition(
                name="create_page",
                label="Create page",
                description="Create a new page.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["title"],
                },
            ),
        ]

    def execute(self, action: str, params: dict, creds: dict) -> dict:
        if action == "create_page":
            # Call provider API, return result
            return {"ok": True, "id": "new-page-id"}
        raise ValueError(f"Unknown action: {action}")
```

```python
# __init__.py
from .read import MyServiceConnector
from .write import MyServiceActionProvider

CONNECTOR = MyServiceConnector()
ACTION_PROVIDER = MyServiceActionProvider()
```

Write actions are executed through the command queue — agents send `source_write` commands, and the gateway's command runner routes them to your `ACTION_PROVIDER.execute()`. The UI shows a "Write access" toggle on the connection detail page when `supports_write` is true.

## What the platform handles

You don't need to touch any of this — it's all automatic:

- **Credential encryption**: Stored encrypted in the `secrets` table, decrypted on the gateway only.
- **OAuth flow**: If your manifest includes `auth.oauth`, the UI renders an OAuth button and handles the full redirect flow.
- **UI forms**: The provider picker, credential forms, setup guides, and content browser are all rendered from your manifest.
- **Sync scheduling**: `source_sync.py` calls your connector on the user-configured interval.
- **Embedding**: Synced content is automatically chunked and embedded for semantic search.
- **Write routing**: Commands flow through the existing `agent_commands` queue.
