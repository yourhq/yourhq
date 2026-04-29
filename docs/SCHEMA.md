# Database Schema

HQ stores shared state in one Supabase project per workspace. The SQL source of truth lives in [`db/migrations/`](../db/migrations/) and should be applied in filename order.

## Migrations

- `001_schema.sql` — core workspace schema, RLS policies, command queues, inbox queues, CRM, tasks, documents, automations, gateways, notifications, and RPCs.
- `002_usage_budget.sql` — LLM usage logging, budget rollups, budget notifications, and recompute RPC.
- `003_agents_reports_to.sql` — agent manager hierarchy and `agent_reports_chain` RPC.

For a fresh Supabase project, run all migration files from the Supabase SQL Editor. For an existing project, review each migration before applying it.

## Trust Model

HQ is designed as single-user admin software.

- The `authenticated` role has broad workspace access.
- The `service_role` key is trusted by the UI and gateway services.
- Workspace isolation is by Supabase project, not by tenant rows inside one shared database.
- The hosted product, when built, should add an account layer outside this self-hosted schema.

Disable public email signup in Supabase unless you intentionally want every signed-up user to have admin-level HQ access.

## Core Tables

### Workspace

- `workspace` — singleton workspace profile, owner preferences, setup state, and budget defaults.
- `audit_log` — append-style audit events for important UI and system actions.
- `notifications` — operator-visible notifications such as budget warnings and command outcomes.

### Agents and Gateways

- `agents` — agent metadata, slug, status, gateway assignment, manager assignment, and template metadata.
- `gateways` — registered gateway hosts, heartbeat state, labels, and reachable URLs.
- `gateway_registration_tokens` — short-lived hashed tokens used by Settings → Gateways → Add Gateway.
- `agent_commands` — command queue consumed by the runner daemon.
- `agent_inbox_items` — background-work queue consumed by agents through the dispatcher/runtime path.

Important RPCs:

- `lease_command(...)` atomically leases pending commands for one gateway.
- `start_command(...)`, `complete_command(...)`, and `fail_command(...)` update command lifecycle state.
- `lease_inbox_item(...)`, `complete_inbox_item(...)`, and `fail_inbox_item(...)` update inbox lifecycle state.
- `agent_reports_chain(...)` returns an agent's manager chain for cycle detection.

### Usage and Budgets

- `agent_usage` — append-only LLM call records with provider, model, tokens, cache tokens, estimated cost, and metadata.
- `agent_budgets` — per-agent budget config and current monthly rollup.

The `agent_usage_rollup` trigger updates `agent_budgets` after each usage row. Budget status changes can create `budget.warned` and `budget.exceeded` notifications.

### CRM

- `contacts` — people records, core fields, pipeline status, priority, relationship strength, and `extended` custom data.
- `organizations` — company/group records and `extended` custom data.
- `contact_organizations` — links between contacts and organizations.
- `interactions` — timeline entries for calls, messages, notes, meetings, and other relationship events.
- `templates`, `campaigns`, `draft_sets` — outreach and campaign workflow data.

### Tasks

- `tasks` — operator and agent work items.
- `streams` — task grouping and workflow lanes.
- `task_series` — recurring task definitions.
- `task_comments` / comments-related tables — discussion and mention surface.
- `task_attachments` — links from tasks to documents/assets/files.

Task assignment and comment mention triggers enqueue `agent_inbox_items` for affected agents.

### Documents and Assets

- `documents` — rich-text knowledge base documents, folders, tags, pinned state, and metadata.
- `document_folders` — folder hierarchy.
- `assets` — operational files and references such as SOPs, research, images, videos, audio, templates, scripts, spreadsheets, and links.
- `asset_folders` — asset folder hierarchy.

Boot-context tags are plain document tags:

- `boot:all` includes a document for every agent.
- `boot:<agent-slug>` includes a document for one agent.

### Automations

- `automation_rules` — event-driven rules that turn CRM/task/comment changes into agent inbox items.
- `agent_inbox_items` — stores the resulting work items, lease state, retry counters, dedup keys, and failure state.

Contact automation rules are evaluated by database functions on contact insert/update.

### Configuration Tables

- `field_definitions` — custom fields by entity type.
- `pipeline_stages` — runtime-configurable pipeline stages.
- `streams` — task stream definitions.

These are configured from the UI and read by forms, tables, kanban views, filters, and agent skills.

## Realtime

The runner and dispatcher use Supabase Realtime subscriptions for low-latency wakeups:

- Runner listens for inserts into `agent_commands`.
- Dispatcher listens for inserts into `agent_inbox_items`.

Both daemons also poll periodically so missed websocket events are eventually reconciled.

## Applying Migrations

Fresh project:

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `001_schema.sql`.
4. Run `002_usage_budget.sql`.
5. Run `003_agents_reports_to.sql`.
6. Create an auth user and disable public signup unless needed.

Existing project:

1. Back up the database.
2. Check which migrations have already been applied.
3. Run only missing migrations.
4. Confirm the UI onboarding validator passes.

`001_schema.sql` expects a clean `public` schema. The later migrations are written to be idempotent where practical.
