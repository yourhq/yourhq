# Database Schema Reference

Single source of truth for the HQ Supabase database.

The entire schema lives in a single consolidated file — [`supabase/migrations/001_command_center.sql`](../supabase/migrations/001_command_center.sql) — meant to be run on a brand-new Supabase project.

All tables have RLS enabled with one policy: authenticated users have full access. This is a single-user application — RLS gates anonymous access only.

All tables are added to the `supabase_realtime` publication with `REPLICA IDENTITY FULL`.

---

## Extensions

| Extension | Schema | Purpose |
|---|---|---|
| `vector` (pgvector) | `extensions` | Embeddings for semantic document search |
| `pg_cron` | default | Schedules `spawn_due_task_instances()` every minute for recurring tasks |

---

## Enums

### Tasks & Agents

| Enum | Values |
|---|---|
| `task_status` | `todo`, `in_progress`, `blocked`, `done`, `cancelled`, `missed` |
| `task_priority` | `urgent`, `high`, `medium`, `low` |
| `stream_type` | `functional`, `project`, `custom` |
| `actor_type` | `human`, `agent`, `system` |
| `audit_action` | `created`, `updated`, `deleted`, `archived`, `status_changed`, `assigned`, `commented`, `uploaded`, `moved`, `restored` |
| `agent_status` | `online`, `offline`, `error`, `paused` |
| `asset_type` | `document`, `sop`, `research`, `image`, `video`, `audio`, `template`, `script`, `spreadsheet`, `link`, `other` |

### Automations & inbox

| Enum | Values |
|---|---|
| `inbox_item_status` | `pending`, `leased`, `done`, `failed`, `dead_letter` |
| `inbox_event_type` | `task_assignment`, `task_reassignment`, `task_comment_mention`, `contact_created`, `contact_status_changed`, `contact_updated` |
| `automation_condition` | `created`, `changed_to`, `changed_from`, `any_change` |

### Agent commands

| Enum | Values |
|---|---|
| `command_action` | `provision`, `approve_pairing`, `update`, `remove`, `restart_gateway`, `update_all`, `restart_dispatcher` |
| `command_status` | `pending`, `leased`, `running`, `done`, `failed` |

---

## Tables

### Configuration

#### `workspace`

Singleton holding workspace identity and owner profile. Managed via Settings → General. Seeded with a single `('HQ', false)` row at install time.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `created_at` / `updated_at` | timestamptz | |
| `name` | text | Display name (default `'HQ'`) |
| `slug` | text | **Used as the prefix for agent branches** |
| `description` | text | |
| `initialized` | boolean | True after setup wizard completes |
| `owner_name`, `owner_preferred_name`, `owner_timezone` | text | Populates `USER.md` on new agent branches |
| `settings` | jsonb | Extensible |

Singleton enforced via unique index on `((true))`; `slug` unique where not null.

#### `pipeline_stages`

Runtime-configurable status stages, keyed by entity type.

| Column | Notes |
|---|---|
| `entity_type` | Default `'contact'` |
| `stage_key` | Unique per entity_type |
| `label`, `color`, `sort_order` | |
| `is_terminal`, `is_default` | |

Unique on `(entity_type, stage_key)`.

#### `field_definitions`

Runtime-configurable custom fields. Values land in the owning row's `extended` JSONB.

| Column | Notes |
|---|---|
| `entity_type` | Default `'contact'` |
| `field_key` | Unique per entity_type |
| `field_type` | `text`, `textarea`, `number`, `boolean`, `url`, `select`, `multiselect`, `date` |
| `label`, `description`, `field_group`, `sort_order` | |
| `required`, `is_active` | |
| `options` | jsonb for select/multiselect |

Unique on `(entity_type, field_key)`.

---

### CRM

#### `tags`

Tag definitions with colors. Reserved for a future tag library UI — contact/org tags are currently plain `text[]`.

#### `campaigns`

Contact grouping for outreach batches. Columns: `name`, `description`, `channel`, `is_active`, `meta`.

#### `contacts`

Generic contact records. Core fields are always present; workstream-specific data goes in `extended` (shape from `field_definitions`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | Required |
| `email`, `phone` | text | |
| `linkedin_url`, `twitter_url`, `website_url` | text | |
| `company`, `title`, `location`, `avatar_url`, `handle` | text | |
| `how_we_met`, `notes` | text | |
| `tags` | text[] | |
| `source` | text | |
| `campaign_id` | uuid FK | `campaigns(id)` ON DELETE SET NULL |
| `status` | text | Default `'new'`; validated against `pipeline_stages` for entity_type=contact |
| `status_changed_at` | timestamptz | |
| `priority` | text | `urgent`, `high`, `medium`, `low` |
| `relationship_strength` | text | Default `'stranger'` |
| `last_contact_date` | timestamptz | Auto-updated by interactions trigger |
| `extended` | jsonb | Dynamic fields |
| `archived_at` | timestamptz | Soft delete |

#### `organizations`

Same generic-core + `extended` pattern as contacts.

Columns: `name`, `type`, `website`, `industry`, `size`, `location`, `description`, `notes`, `tags`, `status`, `extended`, `archived_at`.

#### `contact_organizations`

Many-to-many link.

| Column | Notes |
|---|---|
| `contact_id`, `org_id` | FKs, cascade delete |
| `role` | |
| `is_current` | |
| `started_at`, `ended_at` | |

Unique on `(contact_id, org_id, role)`.

#### `templates`

Reusable message templates.

| Column | Notes |
|---|---|
| `name`, `body` | Required |
| `channel`, `stage` | |
| `subject` | For email |
| `is_active`, `use_count` | Use count auto-incremented by trigger |
| `family`, `angle`, `audience` | Optional grouping |
| `overlays`, `meta` | jsonb |

#### `interactions`

Polymorphic activity timeline (replaces the original `outreach_log`).

| Column | Notes |
|---|---|
| `contact_id` | FK, cascade delete (required) |
| `org_id` | FK, SET NULL |
| `type`, `direction`, `channel` | Free text |
| `subject`, `summary`, `body` | |
| `occurred_at` | Default now() |
| `next_action`, `next_action_date` | Follow-up pointer |
| `template_id` | FK templates, SET NULL |
| `actor_type`, `actor_agent_id` | |
| `meta` | jsonb |

#### `draft_sets`

Three-variant draft system for A/B testing outreach. One set per `(contact_id, channel, stage, version)`.

| Column | Notes |
|---|---|
| `contact_id` | FK, cascade |
| `template_id` | FK, SET NULL |
| `channel`, `stage` | Required |
| `version` | Default 1, check ≥ 1 |
| `variants` | jsonb array |
| `selected_variant_index` | |
| `based_on_draft_set_id` | Self-FK for revision chains |
| `status` | Default `'draft'` |

---

### Agents, streams, tasks

#### `agents`

| Column | Notes |
|---|---|
| `name` | |
| `slug` | Unique |
| `description`, `avatar_url` | |
| `status` | `online` / `offline` / `error` / `paused` |
| `last_seen_at` | Heartbeat |
| `domains`, `capabilities` | text[] |
| `config`, `meta` | jsonb |

#### `streams`

| Column | Notes |
|---|---|
| `name`, `description` | |
| `slug` | Unique |
| `type` | stream_type, default `'functional'` |
| `color`, `icon`, `sort_order` | |
| `is_archived` | |

#### `tasks`

| Column | Notes |
|---|---|
| `title`, `description` | |
| `status` | task_status, default `'todo'` |
| `priority` | task_priority |
| `stream_id` | FK, SET NULL |
| `parent_id` | Self-FK, cascade (subtasks) |
| `assignee_type`, `assignee_agent_id` | |
| `due_date`, `due_at`, `completed_at` | timestamptz |
| `linked_entity_type`, `linked_entity_id` | Generic cross-module pointer |
| `contact_id`, `org_id` | Direct FKs to contacts / organizations, SET NULL |
| `series_id` | FK task_series, SET NULL (set on generated occurrences) |
| `series_occurrence_at` | |
| `is_recurring`, `recurrence_rule`, `last_completed_at` | Recurrence metadata |
| `tags`, `sort_order` | |
| `archived_at` | Soft delete |

Unique constraint `tasks_series_occurrence_key (series_id, series_occurrence_at)` — required for `ON CONFLICT` in the spawner.

#### `task_series`

Recurring task templates.

| Column | Notes |
|---|---|
| `stream_id`, `title`, `description`, `priority` | Task template |
| `assignee_type`, `assignee_agent_id`, `tags`, `linked_entity_type`, `linked_entity_id`, `meta` | |
| `cadence_type` | `daily`, `weekdays`, `weekly`, `monthly`, `every_n_days` |
| `interval_n` | Default 1, check ≥ 1 |
| `days_of_week` | smallint[] (0=Sun..6=Sat) for weekly |
| `day_of_month` | smallint (1..31 or -1 for last day) for monthly |
| `time_of_day` | time (default `'09:00'`) |
| `timezone` | IANA (required) |
| `is_paused`, `starts_on`, `ends_on`, `ends_after_count` | Lifecycle |
| `spawned_count`, `next_occurrence_at`, `last_spawned_at` | State |
| `missed_policy` | `auto_skip` or `queue` |

#### `comments` (polymorphic)

| Column | Notes |
|---|---|
| `entity_type`, `entity_id` | Points to any entity (e.g. `'task'`, task uuid) |
| `parent_id` | Self-FK for threading |
| `body` | |
| `actor_type`, `actor_agent_id` | |
| `mentions` | text[] of agent slugs |

#### `task_attachments`

Many-to-many links between tasks and documents / assets / URLs.

| Column | Notes |
|---|---|
| `task_id` | FK, cascade |
| `entity_type` | `document`, `asset`, or `url` |
| `entity_id` | Required for document/asset |
| `url` | Required for `url` |
| `label` | |

Check constraint enforces document/asset → `entity_id` required, `url` → `url` required. Unique on `(task_id, entity_type, entity_id)`.

---

### Assets & Documents

#### `asset_folders`

`parent_id` (self-FK, cascade), `name`, `color`, `sort_order`.

#### `assets`

| Column | Notes |
|---|---|
| `folder_id` | FK, SET NULL |
| `name`, `description` | |
| `type` | asset_type (11 values) |
| `mime_type`, `file_url`, `file_size`, `content` | |
| `tags`, `meta` | |
| `archived_at` | Soft delete |

#### `document_folders`

`parent_id` (self-FK, cascade), `name`, `icon` (emoji), `sort_order`.

#### `documents`

Knowledge base docs.

| Column | Type | Notes |
|---|---|---|
| `folder_id` | uuid FK | SET NULL |
| `title` | text | |
| `content` | **jsonb** | Tiptap JSON (native jsonb, not a stringified text) |
| `tags` | text[] | Includes boot tags |
| `pinned` | boolean | |
| `meta` | jsonb | |
| `embedding` | `extensions.vector(1536)` | pgvector embedding |
| `archived_at` | timestamptz | |

IVFFlat index on `embedding` with cosine ops, `lists = 10`.

---

### Activity, notifications, inbox

#### `audit_log`

| Column | Notes |
|---|---|
| `actor_type`, `actor_agent_id` | |
| `module`, `entity_type`, `entity_id` | |
| `action` | audit_action |
| `summary`, `changes`, `meta` | |

#### `notifications`

| Column | Notes |
|---|---|
| `type` | `follow_up`, `stale_contact`, `agent_suggestion`, `task_reminder`, `system` |
| `title`, `body` | |
| `entity_type`, `entity_id` | Optional link target |
| `actor_type`, `actor_agent_id` | |
| `is_read`, `read_at`, `dismissed_at` | State |
| `meta` | jsonb |

#### `agent_inbox_items`

Durable, lease-based work queue.

| Column | Notes |
|---|---|
| `agent_id` | FK, cascade |
| `agent_slug` | Denormalized |
| `event_type` | inbox_event_type |
| `task_id`, `comment_id`, `contact_id` | Optional FKs, cascade |
| `status` | inbox_item_status |
| `leased_at`, `leased_until`, `completed_at`, `failed_at` | |
| `attempt_count` / `max_attempts` | Default max 3 |
| `summary`, `context` | |
| `last_wake_attempt_at`, `last_wake_success_at` | |
| `dedup_key` | UNIQUE — prevents duplicate enqueues |

---

### Automations

#### `automation_rules`

Rules that enqueue inbox items when watched columns change.

| Column | Notes |
|---|---|
| `table_name` | Currently `contacts` |
| `field` | Column to watch; null for `created` |
| `condition` | automation_condition |
| `value` | Target value for `changed_to`/`changed_from` |
| `target_agent_id`, `target_agent_slug` | |
| `event_type` | inbox_event_type |
| `summary_template` | Supports `{name}`, `{new_value}`, `{old_value}` |
| `is_active`, `meta` | |

The `process_contact_automation()` trigger can resolve rule fields against real columns (`status`, `priority`, `relationship_strength`) and falls back to `extended ->> field` for dynamic-field values.

---

### Agent commands

#### `agent_commands`

Durable command channel for agent lifecycle operations. A daemon on the agent host leases commands via Realtime, executes them, and writes results back.

| Column | Notes |
|---|---|
| `agent_id` | FK, SET NULL (nullable for system-scoped) |
| `agent_slug` | |
| `action` | command_action |
| `payload` | jsonb |
| `status` | command_status |
| `leased_at`, `leased_until`, `started_at`, `completed_at`, `failed_at` | |
| `exit_code`, `stdout`, `stderr`, `error_message` | |
| `requested_by` | uuid |

---

## Triggers & functions

### Shared

| Trigger | Tables | Function |
|---|---|---|
| `*_updated_at` | All tables with `updated_at` | `set_updated_at()` |

### CRM

| Trigger | Table | Function |
|---|---|---|
| `interactions_sync_contact` | interactions | `sync_contact_last_interaction()` — bumps `contacts.last_contact_date` |
| `interactions_template_use` | interactions | `increment_template_use()` — bumps `templates.use_count` |
| `contacts_automation` | contacts | `process_contact_automation()` — evaluates `automation_rules`, enqueues inbox items |

### Tasks

| Trigger | Table | Function |
|---|---|---|
| `tasks_sync_completion` | tasks | `sync_task_completion()` — manages `completed_at` |
| `task_attachments_sync_parent` | task_attachments | `sync_task_attachment_updated()` — touches task `updated_at` |
| `tasks_enqueue_assignment` | tasks | `enqueue_task_assignment()` — inbox item on `assignee_agent_id` change |
| `task_series_sync` | task_series | `task_series_sync_next_occurrence()` — keeps `next_occurrence_at` current |

### Comments

| Trigger | Table | Function |
|---|---|---|
| `comments_enqueue_mentions` | comments | `enqueue_comment_mentions()` — inbox item per mentioned slug |

### Recurring-task scheduling

`spawn_due_task_instances()` is scheduled via `pg_cron` to run every minute:

```sql
SELECT cron.schedule(
  'spawn-due-task-instances',
  '* * * * *',
  $cron$SELECT public.spawn_due_task_instances();$cron$
);
```

It walks unpaused, due series; catches up missed occurrences (honoring `missed_policy`); inserts one new `tasks` row per spawn (with `ON CONFLICT (series_id, series_occurrence_at) DO NOTHING`); and updates `spawned_count`, `last_spawned_at`, `next_occurrence_at`. Auto-pauses the series when `ends_after_count` is reached or the next occurrence would fall past `ends_on`.

`recurring_tasks_debug()` returns per-series state (next run, seconds-until-next, counts) for UI diagnostics.

### Helper RPCs

| Function | Returns | Purpose |
|---|---|---|
| `complete_setup(p_name, p_slug, p_description, p_owner_name, p_preferred_name, p_timezone, p_stages, p_fields, p_streams)` | void | Atomically seed workspace + pipeline_stages + field_definitions + streams. Idempotent — clears wizard-seeded rows before inserting. |
| `next_occurrence(p_series, p_from_ts)` | timestamptz | Compute the next UTC occurrence for a series from a given timestamp, honoring cadence / timezone / day-of-week / day-of-month |
| `spawn_due_task_instances()` | void | Scheduled spawner (see above). `SECURITY DEFINER`, granted to `authenticated` |
| `recurring_tasks_debug()` | TABLE | Per-series diagnostics. `SECURITY DEFINER`, granted to `authenticated` |
| `lease_inbox_item(p_agent_id, p_lease_seconds)` | SETOF agent_inbox_items | Atomic lease, row-locked |
| `complete_inbox_item(p_item_id)` | void | Mark done |
| `fail_inbox_item(p_item_id, p_reason)` | void | Fail, auto-promote to `dead_letter` after `max_attempts` |
| `lease_command(p_lease_seconds)` | SETOF agent_commands | Atomic command lease |
| `start_command(p_command_id)` | void | Mark command as `running` |
| `complete_command(p_command_id, p_exit_code, p_stdout, p_stderr)` | void | Mark command `done` |
| `fail_command(p_command_id, p_exit_code, p_stdout, p_stderr, p_error)` | void | Mark command `failed` |
| `search_documents(query_embedding, match_count, filter_tags, filter_folder_id)` | TABLE | Cosine-similarity search over `documents.embedding` |

---

## Storage

| Bucket | Public | Purpose |
|---|---|---|
| `assets` | false | File uploads for the assets module. UI generates 1-hour signed URLs. |

Policies (authenticated): INSERT / SELECT / UPDATE / DELETE on `storage.objects` where `bucket_id = 'assets'`.

---

## Row Level Security

Enabled on every table with one permissive policy:

```sql
CREATE POLICY "Authenticated full access"
  ON <table> FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

Tables under RLS: `workspace`, `pipeline_stages`, `field_definitions`, `tags`, `campaigns`, `contacts`, `organizations`, `contact_organizations`, `templates`, `interactions`, `draft_sets`, `agents`, `streams`, `tasks`, `task_series`, `comments`, `task_attachments`, `asset_folders`, `assets`, `document_folders`, `documents`, `audit_log`, `notifications`, `agent_inbox_items`, `automation_rules`, `agent_commands`.

---

## Realtime

All tables above (minus `tags` is included too) are added to `supabase_realtime` with `REPLICA IDENTITY FULL`, so UPDATE events carry the full old and new rows.

---

## Foreign key relationships (summary)

```
workspace (singleton)
pipeline_stages · field_definitions                           (config)

campaigns ──< contacts >── contact_organizations ──< organizations
contacts  ──< interactions
contacts  ──< draft_sets
contacts  ──< agent_inbox_items
contacts  ──< tasks (contact_id)
organizations ──< interactions
organizations ──< tasks (org_id)
templates ──< interactions
templates ──< draft_sets

agents    ──< tasks (assignee_agent_id)
agents    ──< task_series (assignee_agent_id)
agents    ──< comments (actor_agent_id)
agents    ──< interactions (actor_agent_id)
agents    ──< audit_log (actor_agent_id)
agents    ──< agent_inbox_items (agent_id)
agents    ──< agent_commands (agent_id)
agents    ──< automation_rules (target_agent_id)

streams   ──< tasks (stream_id)
streams   ──< task_series (stream_id)
task_series ──< tasks (series_id)
tasks     ──< tasks (parent_id)              [subtasks]
tasks     ──< task_attachments
tasks     ──< agent_inbox_items
comments  ──< comments (parent_id)           [replies]
comments  ──< agent_inbox_items (comment_id)

asset_folders ──< asset_folders              [nesting]
asset_folders ──< assets
document_folders ──< document_folders        [nesting]
document_folders ──< documents

draft_sets ──< draft_sets (based_on_draft_set_id)  [revision chain]
```

---

## Install

Run the one file against a fresh Supabase project:

```bash
psql "$DATABASE_URL" -f supabase/migrations/001_command_center.sql
```

It's idempotent for the parts that need to be (the pg_cron schedule uses unschedule-then-schedule; storage bucket insert is `ON CONFLICT DO NOTHING`). Everything else assumes a clean database.
