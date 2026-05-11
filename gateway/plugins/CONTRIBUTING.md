# Writing an HQ Plugin

HQ plugins react to events (task created, agent provisioned, budget exceeded, etc.) and take actions — post to Slack, sync to Linear, trigger webhooks, log alerts.

Two plugin types:

- **Local plugins** — Python modules on the gateway. Full access to the plugin SDK (state, secrets, Supabase queries).
- **Webhook plugins** — Remote HTTP endpoints. Zero gateway code. HQ POSTs events with HMAC signatures.

---

## Quick start: local plugin

```bash
# 1. Copy the template
cp -r gateway/plugins/_template gateway/plugins/my-plugin

# 2. Edit manifest.json — set id, name, hooks, config_schema, capabilities

# 3. Implement handler.py — subclass BasePlugin, implement on_event()

# 4. Restart the gateway — plugin runner auto-discovers new modules
#    Or: insert a row into hq_plugins from Settings → Plugins
```

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "What it does, in one sentence.",
  "version": "0.1.0",
  "author": "your-name",
  "source": "local",
  "hooks": ["task.completed", "agent.status_changed"],
  "config_schema": {
    "type": "object",
    "properties": {
      "webhook_url": { "type": "string", "title": "Slack Webhook URL" }
    },
    "required": ["webhook_url"]
  },
  "capabilities": ["secrets.read", "http.outbound"]
}
```

### handler.py

```python
from gateway.plugins.sdk import BasePlugin, PluginEvent, PluginResponse


class Handler(BasePlugin):

    def on_event(self, event: PluginEvent) -> PluginResponse | None:
        if event.event_type == "task.completed":
            task = event.payload
            self.ctx.logger.info(f"Task completed: {task.get('title')}")
            # Your logic here
            return PluginResponse(log_message=f"Processed task {event.entity_id}")
        return None
```

### Plugin context

Inside `on_event`, you have access to `self.ctx`:

| Attribute | Type | Description |
|-----------|------|-------------|
| `config` | `dict` | Operator-supplied config from the UI |
| `state` | `StateClient` | Scoped key-value store (persists across events) |
| `secrets` | `SecretsClient` | Read-only access to gateway secrets |
| `supabase` | `SupabaseClient` | Read-only Supabase queries |
| `logger` | `Logger` | Plugin-namespaced logger |

### State client

```python
# Global state
self.ctx.state.set("cursor", "2025-01-01T00:00:00Z")
cursor = self.ctx.state.get("cursor")

# Scoped to an agent
self.ctx.state.set("warned", True, scope_kind="agent", scope_id=agent_id)
warned = self.ctx.state.get("warned", scope_kind="agent", scope_id=agent_id)
```

---

## Quick start: webhook plugin

No code on the gateway. Register entirely from the UI.

1. Deploy an HTTP endpoint that accepts POST requests
2. In **Settings → Plugins → Add plugin**:
   - Enter your endpoint URL
   - Select which events to receive
   - Optionally set a signing secret
3. Verify webhook signatures using HMAC-SHA256

### Webhook payload

```json
{
  "event_id": "uuid",
  "event_type": "task.completed",
  "occurred_at": "2025-01-15T10:30:00+00:00",
  "tenant_id": "uuid",
  "entity_type": "tasks",
  "entity_id": "uuid",
  "payload": { ... }
}
```

### Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-HQ-Event` | Event type (e.g. `task.completed`) |
| `X-HQ-Plugin-Id` | Plugin identifier |
| `X-HQ-Delivery` | Unique delivery ID |
| `X-HQ-Signature` | `sha256=<hex>` HMAC signature (if secret configured) |

### Signature verification (Node.js example)

```javascript
const crypto = require("crypto");

function verify(secret, body, signature) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}
```

---

## Available events

| Event | Description | Payload includes |
|-------|-------------|-----------------|
| `task.created` | New task | title, status, priority, assignee_agent_id |
| `task.completed` | Task marked done | title, assignee_agent_id, completed_at |
| `task.assigned` | Task reassigned | old_agent_id, new_agent_id |
| `agent.provisioned` | Agent set up | agent_id, slug, runtime_type |
| `agent.deprovisioned` | Agent removed | agent_id, slug |
| `agent.status_changed` | Agent status change | old_status, new_status |
| `knowledge.created` | Knowledge item added | title, kind, scope |
| `knowledge.processed` | File text extracted | title, content_length |
| `knowledge.embedded` | Embeddings generated | chunk_count |
| `inbox.created` | Inbox item queued | agent_id, event_type, summary |
| `inbox.completed` | Inbox item done | agent_id, event_type |
| `routine.triggered` | Routine fired | routine_id, agent_id, trigger_type |
| `comment.created` | Comment posted | entity_type, entity_id, author_agent_id |
| `secret.changed` | Secret modified | key, category, action (no values) |
| `usage.recorded` | LLM usage logged | agent_id, provider, model, cost_usd |
| `budget.exceeded` | Agent over budget | agent_id, monthly_limit_usd, spent_usd |

---

## Capabilities

Declare in `manifest.json → capabilities[]`. Advisory for now, enforced when sandboxing is added.

| Capability | Grants |
|-----------|--------|
| `secrets.read` | `ctx.secrets.resolve()` |
| `http.outbound` | External HTTP requests |
| `supabase.read` | `ctx.supabase.query()` |
| `state.read` | `ctx.state.get()` |
| `state.write` | `ctx.state.set()`, `ctx.state.delete()` |

---

## Testing

Test your plugin locally by creating a handler instance and calling `on_event` directly:

```python
from gateway.plugins.sdk import PluginEvent, PluginContext, StateClient, SecretsClient, SupabaseClient
import logging

# Build a test context
ctx = PluginContext(
    config={"webhook_url": "https://example.com/test"},
    state=...,      # mock or real StateClient
    secrets=...,    # mock or real SecretsClient
    supabase=...,   # mock or real SupabaseClient
    logger=logging.getLogger("test"),
)

from gateway.plugins.my_plugin.handler import Handler
handler = Handler(ctx)

event = PluginEvent(
    event_id="test-1",
    event_type="task.completed",
    occurred_at="2025-01-15T10:30:00+00:00",
    tenant_id="00000000-0000-0000-0000-000000000000",
    entity_type="tasks",
    entity_id="some-task-id",
    payload={"title": "Test task", "status": "done"},
)

result = handler.on_event(event)
print(result)
```
