# Task System

Task management with streams, priority levels, human/agent assignment, nested comments, attachments, and recurring series.

---

## Tables

### `streams` — Work areas / projects

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | |
| `description` | text | |
| `type` | `stream_type` | `functional`, `project`, `custom` |
| `color` | text | Hex |
| `icon` | text | Lucide icon name |
| `is_archived` | boolean | Soft-delete |
| `sort_order` | integer | |
| `meta` | jsonb | |

Seeded during setup via the setup wizard; managed from the Tasks page sidebar.

### `tasks`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `stream_id` | uuid FK | Nullable |
| `parent_id` | uuid FK (self) | Subtasks, cascade delete |
| `title` | text | |
| `description` | text | |
| `status` | `task_status` | `todo`, `in_progress`, `blocked`, `done`, `cancelled`, `missed` |
| `priority` | `task_priority` | `urgent`, `high`, `medium`, `low` |
| `assignee_type` | `actor_type` | `human`, `agent`, or null |
| `assignee_agent_id` | uuid FK | Set when `assignee_type = 'agent'` |
| `due_date` | date | |
| `due_at` | timestamptz | Time-of-day precision for recurring tasks |
| `completed_at` | timestamptz | Auto-set by trigger |
| `sort_order` | integer | |
| `tags` | text[] | |
| `linked_entity_type` / `linked_entity_id` | Simple cross-module pointer (e.g. `"contact"` → contact UUID) |
| `series_id` | uuid FK | Set when this task was generated from a recurring series |
| `series_occurrence_at` | timestamptz | The scheduled occurrence this task represents |
| `archived_at` | timestamptz | Soft delete |
| `meta` | jsonb | |

### `task_series` — Recurring task templates

| Column | Notes |
|---|---|
| `cadence_type` | `daily`, `weekdays`, `weekly`, `monthly`, `every_n_days` |
| `interval_n` | For `every_n_days` |
| `days_of_week` | For `weekly` |
| `day_of_month` | For `monthly` |
| `time_of_day` | HH:MM local time |
| `timezone` | IANA timezone (falls back to workspace timezone) |
| `starts_on`, `ends_on` | Series bounds |
| `is_paused` | Suspends generation without deleting |

Generates concrete `tasks` rows carrying `series_id` + `series_occurrence_at`. Editing a generated occurrence prompts the scope dialog ([recurrence-scope-dialog.tsx](../src/components/tasks/recurrence-scope-dialog.tsx)): this occurrence / future / all.

### `comments` — Threaded task comments

| Column | Notes |
|---|---|
| `task_id` | FK, cascade delete |
| `parent_id` | Self-FK for threading |
| `actor_type`, `actor_agent_id` | Who wrote it |
| `body` | Text |
| `mentions` | text[] of agent slugs |
| `meta` | jsonb |

### `task_attachments` — Links tasks to documents, assets, or external URLs

| Column | Notes |
|---|---|
| `entity_type` | `document`, `asset`, or `url` |
| `entity_id` | FK to `documents(id)` or `assets(id)` (required for document/asset) |
| `url` | Required for `url` type |
| `label` | Display name |
| `added_by` | `human` or `agent` |

Constraints: check ensures document/asset types have `entity_id` and `url` type has `url`. Unique on `(task_id, entity_type, entity_id)` to prevent duplicates.

---

## Triggers

| Trigger | Purpose |
|---|---|
| `sync_task_completion()` | Sets `completed_at = now()` when `status → done`, clears it when moving away |
| `sync_task_attachment_updated()` | Touches the parent task's `updated_at` on attachment add/remove so list views stay fresh |
| `enqueue_task_assignment()` | Creates an `agent_inbox_items` row when `assignee_agent_id` is set or changed |
| `enqueue_comment_mentions()` | Creates inbox items for each slug in `comments.mentions` |

---

## API examples

### Create a task

```python
supabase.table("tasks").insert({
    "title": "Research 20 prospects",
    "description": "Target: founders in b2b SaaS with recent fundraises",
    "status": "todo",
    "priority": "high",
    "stream_id": stream_id,
    "assignee_type": "agent",
    "assignee_agent_id": agent_id,
    "due_date": "2026-05-01",
    "tags": ["research"],
}).execute()
```

### Update status

```python
supabase.table("tasks").update({"status": "done"}).eq("id", task_id).execute()
# completed_at set automatically
```

### Comment with a mention

```python
supabase.table("comments").insert({
    "task_id": task_id,
    "actor_type": "agent",
    "actor_agent_id": agent_id,
    "body": "Found 15 matches. @outreach ready for review.",
    "mentions": ["outreach"],
}).execute()
```

### Query by stream

```python
tasks = supabase.table("tasks").select(
    "*, stream:streams(*), assignee_agent:agents(id, name, slug)"
).eq("stream_id", stream_id).order("sort_order").execute()
```

### Query overdue work

```python
overdue = supabase.table("tasks").select("*").in_(
    "status", ["todo", "in_progress", "blocked"]
).lt("due_date", date.today().isoformat()).execute()
```

---

## Task attachments

Attachments are the primary way to hand context to an agent picking up a task — SOPs, research docs, reference URLs.

```python
# Document
supabase.table("task_attachments").insert({
    "task_id": task_id,
    "entity_type": "document",
    "entity_id": document_id,
    "label": "Research playbook",
    "added_by": "agent",
}).execute()

# Asset
supabase.table("task_attachments").insert({
    "task_id": task_id,
    "entity_type": "asset",
    "entity_id": asset_id,
    "label": "Outreach SOP v2",
    "added_by": "agent",
}).execute()

# External URL
supabase.table("task_attachments").insert({
    "task_id": task_id,
    "entity_type": "url",
    "url": "https://example.com/reference",
    "label": "Reference",
    "added_by": "agent",
}).execute()
```

### Find all tasks referencing a specific document

```python
tasks_with_doc = supabase.table("task_attachments").select(
    "task_id, tasks(id, title, status)"
).eq("entity_type", "document").eq("entity_id", doc_id).execute()
```

---

## Entity linking (legacy, single-target)

`tasks.linked_entity_type` + `linked_entity_id` is a simple pointer for the common "this task is about this contact" case. For multiple references, use `task_attachments`.

```python
supabase.table("tasks").insert({
    "title": "Follow up",
    "linked_entity_type": "contact",
    "linked_entity_id": contact_id,
    "stream_id": stream_id,
}).execute()
```

---

## UI overview

### Tasks page — [/dashboard/tasks](../src/app/dashboard/tasks/page.tsx)

- **Stream sidebar** — [stream-list.tsx](../src/components/tasks/stream-list.tsx), with counts and a "new stream" button
- **View modes** (localStorage-persisted):
  - List — [task-list.tsx](../src/components/tasks/task-list.tsx)
  - Board — [task-board-view.tsx](../src/components/tasks/task-board-view.tsx) (drag-and-drop Kanban with inline quick-add per column)
  - Recurring — [series-list-view.tsx](../src/components/tasks/series-list-view.tsx)
- **Filters** — stream, status, priority, assignee, archived toggle
- **Deep links** — `?task=<id>` opens the task form, `?series=<id>` opens the series editor

### Task form — [task-form.tsx](../src/components/tasks/task-form.tsx)

Linear-style dialog: hero title, inline property tokens (status, priority, assignee, due date, stream), collapsible description, comment thread, attachments, recurrence picker.

- [comment-thread.tsx](../src/components/tasks/comment-thread.tsx) + [comment-form.tsx](../src/components/tasks/comment-form.tsx) with `@agent` autocomplete ([mention-autocomplete.tsx](../src/components/tasks/mention-autocomplete.tsx))
- [task-attachments.tsx](../src/components/tasks/task-attachments.tsx) + [attachment-picker.tsx](../src/components/tasks/attachment-picker.tsx)
- [recurrence-picker.tsx](../src/components/tasks/recurrence-picker.tsx) for creating/editing series

### Assignment flow

1. Human or agent sets `assignee_agent_id` on a task.
2. `enqueue_task_assignment` trigger fires, creating an `agent_inbox_items` row with event type `task_assignment`.
3. The target agent either polls or subscribes to its inbox (via `supabase_realtime`) and picks up the work.

See [AGENTS.md](./AGENTS.md) for inbox processing details.
