# Agent System

AI agents are external processes that read and write directly against Supabase using the service-role key. The HQ UI provides a registry, file editor, command queue, and inbox for each agent; agents themselves run outside the app.

---

## Agent registry — `agents` table

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Display name |
| `slug` | text | Unique identifier used by triggers, automations, mentions |
| `description` | text | |
| `avatar_url` | text | |
| `status` | agent_status | `online`, `offline`, `error`, `paused` |
| `last_seen_at` | timestamptz | Updated by the agent's heartbeat |
| `domains` | text[] | Modules the agent operates in, e.g. `["crm","tasks"]` |
| `capabilities` | text[] | What the agent can do |
| `config` | jsonb | Agent-specific configuration |
| `meta` | jsonb | Wizard-populated metadata (see below) |

### `meta` structure (populated by the creation wizard)

| Key | Notes |
|---|---|
| `emoji` | Icon shown in the agent list |
| `team` | Grouping label, inherited from the template's `agent.json` |
| `template_branch` | Source template branch, or `null` for Custom |
| `telegram_token_env` | Name of the env var holding the bot token |

---

## Creating an agent

### Via the UI

Use the three-step wizard at `/dashboard/agents` → "New agent":

1. **Template** — pick a `template/*` branch from the agent workspace repo (discovered via `/api/agents/templates`, grouped by `team`). "Custom" forks the repo default branch.
2. **Identity** — name (auto-slug), emoji, optional description (pre-filled from the template).
3. **Telegram** — optional bot token (collected but not persisted yet).

Server action [createAgentWithBranch](../src/app/dashboard/agents/actions.ts):

1. Validates the slug (`[a-z0-9](?:-[a-z0-9])*`, not in the reserved list)
2. Checks branch + DB uniqueness in parallel
3. Resolves branch name via [resolveAgentBranch](../src/lib/workspace/branch.ts) → `{workspace.slug}/{agent-slug}`
4. Creates the branch from template (or default)
5. Patches `agent.json` with identity fields
6. Fills `USER.md` placeholder tokens from the workspace owner profile
7. Inserts the `agents` row
8. Rolls back (deletes the branch) on any downstream failure

### Via Supabase API

```python
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

supabase.table("agents").insert({
    "name": "Research Scout",
    "slug": "research-scout",
    "description": "Finds and qualifies new leads",
    "status": "online",
    "domains": ["crm"],
    "capabilities": ["research", "data-collection"],
}).execute()
```

Note: creating an agent via the API skips the GitHub branch setup. Use the UI wizard if you want a workspace branch.

---

## Heartbeat

Agents should periodically update `status` and `last_seen_at`:

```python
supabase.table("agents").update({
    "status": "online",
    "last_seen_at": datetime.utcnow().isoformat(),
}).eq("slug", "research-scout").execute()
```

Set `status = "error"` on failure, `"paused"` when intentionally stopped. The agents page shows a pulse animation on `online` agents.

---

## Actor tracking

Whenever an agent writes to a table that has actor columns, it should identify itself:

```python
supabase.table("interactions").insert({
    "contact_id": contact_id,
    "type": "note",
    "body": "Completed enrichment.",
    "actor_type": "agent",
    "actor_agent_id": agent_id,
    "occurred_at": datetime.utcnow().isoformat(),
}).execute()
```

Tables with actor columns: `interactions`, `comments`, `audit_log`, `agent_inbox_items`.

---

## Task assignment

```python
# Assign a task
supabase.table("tasks").update({
    "assignee_type": "agent",
    "assignee_agent_id": agent_id,
    "status": "in_progress",
}).eq("id", task_id).execute()

# Query assigned work
tasks = supabase.table("tasks").select("*").eq(
    "assignee_agent_id", agent_id
).in_("status", ["todo", "in_progress"]).execute()
```

Setting `assignee_agent_id` fires the `enqueue_task_assignment` trigger, which creates an inbox item with event type `task_assignment` or `task_reassignment`.

---

## Comments & mentions

```python
supabase.table("comments").insert({
    "task_id": task_id,
    "actor_type": "agent",
    "actor_agent_id": agent_id,
    "body": "Research complete. @outreach ready for follow-up.",
    "mentions": ["outreach"],   # agent slugs
}).execute()
```

Slugs in `mentions[]` fire the `enqueue_comment_mentions` trigger, creating an inbox item for each mentioned agent with event type `task_comment_mention`.

---

## Agent inbox — `agent_inbox_items`

Durable, lease-based work queue. Populated by triggers and automation rules; drained by agents.

### How items get created

| Source | Event type |
|---|---|
| Task assignment | `task_assignment` / `task_reassignment` |
| `@agent` in a comment | `task_comment_mention` |
| `automation_rules` matches a contact change | `contact_created` / `contact_status_changed` / `contact_updated` |

### Processing pattern

```python
# 1. Lease the next item (atomic, row-locked)
result = supabase.rpc("lease_inbox_item", {
    "p_agent_id": agent_id,
    "p_lease_seconds": 120,
}).execute()

if not result.data:
    return  # nothing to do

item = result.data[0]

# 2. Do the work
try:
    handle(item)
    supabase.rpc("complete_inbox_item", {"p_item_id": item["id"]}).execute()
except Exception as e:
    supabase.rpc("fail_inbox_item", {
        "p_item_id": item["id"],
        "p_reason": str(e),
    }).execute()  # auto-promotes to dead_letter after max_attempts
```

Lifecycle: `pending → leased → done | failed | dead_letter`.

### Realtime

`agent_inbox_items` is on the `supabase_realtime` publication. Subscribe for instant wake-up instead of polling:

```python
supabase.channel("inbox").on(
    "postgres_changes",
    event="INSERT",
    schema="public",
    table="agent_inbox_items",
    filter=f"agent_id=eq.{agent_id}",
    callback=on_new_item,
).subscribe()
```

---

## Automation rules

`automation_rules` defines reactive rules that enqueue inbox items.

| Field | Notes |
|---|---|
| `table_name` | Table to watch (currently `contacts`) |
| `field` | Column to watch (null for `created`) |
| `condition` | `created`, `changed_to`, `changed_from`, `any_change` |
| `value` | Target value for `changed_to` / `changed_from` |
| `target_agent_id` / `target_agent_slug` | Which agent receives the item |
| `event_type` | Inbox event type to enqueue |
| `summary_template` | Supports `{name}`, `{new_value}`, `{old_value}` placeholders |
| `is_active` | Toggle without deletion |

Managed at `/dashboard/automations`. Evaluated by the `process_contact_automation()` trigger on `contacts` insert/update.

### Example

```sql
-- Notify the enrichment agent whenever a new contact lands
INSERT INTO automation_rules
  (table_name, field, condition, value,
   target_agent_id, target_agent_slug, event_type, summary_template, is_active)
VALUES
  ('contacts', NULL, 'created', NULL,
   '<agent-uuid>', 'enrichment', 'contact_created',
   'New contact created: {name}', true);
```

---

## Agent commands — `agent_commands`

Separate from the inbox queue. `agent_commands` is a durable command channel for lifecycle operations, populated by the HQ UI and drained by agents and the system dispatcher.

| Scope | Actions |
|---|---|
| Agent-scoped | `provision`, `approve_pairing`, `update`, `restart`, `remove` |
| System-scoped | `restart_gateway`, `update_all`, `restart_dispatcher` |

Lifecycle: `pending → leased → running → done | failed`. Managed via the [enqueueAgentCommand](../src/app/dashboard/agents/actions.ts) server action. History + expandable stdout/stderr at `/dashboard/settings/system`.

Writes to an agent's workspace branch (via the file editor) automatically enqueue an `update` command.

---

## Context documents (boot tags)

Agents load baseline context at startup using **boot tags** on documents.

| Tag | Who loads it |
|---|---|
| `boot:all` | Every agent |
| `boot:<agent-slug>` | Only that agent |

Boot tags are plain strings in the `documents.tags text[]` array. See [DOCUMENTS.md](./DOCUMENTS.md) for full schema and content format.

### Startup query

```python
slug = "research-scout"
docs = supabase.table("documents").select(
    "id, title, content, tags"
).or_(f"tags.cs.{{boot:all}},tags.cs.{{boot:{slug}}}").execute()

for doc in docs.data:
    content = doc["content"]   # Tiptap JSON (jsonb column → dict)
    # load into agent context…
```

### What to boot-tag

- `boot:all` — workspace-wide context every agent needs (owner profile, shared conventions).
- `boot:<slug>` — agent-specific playbooks, voice guides, workflow instructions.
- Everything else — available on-demand via tag search or semantic search. No boot tag = not loaded at startup.

UI: the agent detail page lists both classes of context documents. Context tags are managed from the document editor.

---

## Domain labels

Standard domain values the UI recognizes:

| Value | UI label |
|---|---|
| `crm` | CRM |
| `tasks` | Tasks |
| `assets` | Assets |
| `analytics` | Analytics |

Domains are free text — use these if you want your agent to appear correctly in filter dropdowns, or add new ones as needed.

---

## Connecting to Supabase

Agents must use the **service-role key** to bypass RLS:

```python
# Python
from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
```

```typescript
// TypeScript / Node.js
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

Never put the service-role key in the web app. Agents run outside the browser.
