# FEATURES.md — HQ Feature Reference

Comprehensive reference of every feature, page, and workflow in the HQ. Organized by module. Links back to implementation files so you can jump straight to code.

For schema details see [SCHEMA.md](./SCHEMA.md). For architecture see [ARCHITECTURE.md](./ARCHITECTURE.md). Module-specific deep dives: [CRM.md](./CRM.md), [TASKS.md](./TASKS.md), [AGENTS.md](./AGENTS.md), [ASSETS.md](./ASSETS.md), [DOCUMENTS.md](./DOCUMENTS.md), [UI_PATTERNS.md](./UI_PATTERNS.md).

---

## Table of contents

1. [Authentication & Setup](#1-authentication--setup)
2. [Dashboard Home](#2-dashboard-home)
3. [CRM](#3-crm)
4. [Organizations](#4-organizations)
5. [Tasks](#5-tasks)
6. [Agents](#6-agents)
7. [Documents](#7-documents-knowledge-base)
8. [Assets](#8-assets)
9. [Automations](#9-automations)
10. [Notifications](#10-notifications)
11. [Activity Log](#11-activity-log)
12. [Settings](#12-settings)
13. [Import Wizard](#13-import-wizard)
14. [Cross-cutting features](#14-cross-cutting-features)
15. [Keyboard shortcuts](#15-keyboard-shortcuts)
16. [API & server actions reference](#16-api--server-actions-reference)

---

## 1. Authentication & Setup

### Login — [src/app/login/page.tsx](../src/app/login/page.tsx)
- Supabase email/password authentication
- Redirects authenticated users to `/dashboard`
- Error display with inline alert

### Middleware auth guard — [src/middleware.ts](../src/middleware.ts) + [src/lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts)
- Runs on every request (except static assets)
- Refreshes Supabase session cookies
- Redirects unauthenticated users to `/login`
- Redirects authenticated users away from `/login`

### Setup Wizard — [src/app/setup/](../src/app/setup/)
Six-step onboarding flow, runs once on first login until `workspace.initialized = true`.

| Step | File | Purpose |
|---|---|---|
| Workspace | [step-workspace.tsx](../src/components/setup/step-workspace.tsx) | Name, slug, description |
| Profile | [step-profile.tsx](../src/components/setup/step-profile.tsx) | Owner name, preferred name, timezone |
| Pipeline | [step-pipeline.tsx](../src/components/setup/step-pipeline.tsx) | Pick/customize CRM pipeline template |
| Fields | [step-fields.tsx](../src/components/setup/step-fields.tsx) | Select custom field template |
| Streams | [step-streams.tsx](../src/components/setup/step-streams.tsx) | Enable/customize task streams |
| Done | [step-done.tsx](../src/components/setup/step-done.tsx) | Confirmation + next actions |

- Server action [completeSetup](../src/app/setup/actions.ts) calls RPC `complete_setup` to seed `workspace`, `pipeline_stages`, `field_definitions`, and `streams` atomically
- Dev-only reset endpoint [/setup/reset](../src/app/setup/reset/route.ts) clears config for testing (404 in production)

---

## 2. Dashboard Home

### Overview page — [src/app/dashboard/page.tsx](../src/app/dashboard/page.tsx)
Aggregated, at-a-glance view of workspace health. Loaded via server action [fetchDashboardStats](../src/app/dashboard/actions.ts).

Sections:
- **Pipeline** — Contact count per stage (from `pipeline_stages`)
- **Tasks** — Counts by status (todo / in_progress / blocked / done) and overdue count
- **Agents** — Fleet status counts + actions in last 24h
- **Follow-ups due** — Interactions with `next_action_date` overdue (top 20)
- **Recent activity** — Last 10 audit log entries

### Error boundary — [src/app/dashboard/error.tsx](../src/app/dashboard/error.tsx)
Catches uncaught render errors in any dashboard child route with a reset button.

---

## 3. CRM

### CRM Hub — [src/app/dashboard/crm/page.tsx](../src/app/dashboard/crm/page.tsx)
Tabbed interface with URL-synced tabs (`?tab=contacts|campaigns|templates`).

#### Contacts tab — [contacts-tab.tsx](../src/components/crm/contacts-tab.tsx)
Three view modes (persisted to localStorage):
- **Table view** — [contacts-table-view.tsx](../src/components/crm/contacts-table-view.tsx) — TanStack React Table with sortable columns, column toggling, row selection
- **Card view** — [contacts-card-view.tsx](../src/components/crm/contacts-card-view.tsx) — Responsive grid of preview cards
- **Kanban view** — [contacts-kanban-view.tsx](../src/components/crm/contacts-kanban-view.tsx) — Drag-and-drop columns per pipeline stage

Filters and search:
- URL-synced filters (`?status=...&q=...`)
- Pipeline stage filter (from `pipeline_stages` runtime config)
- Priority, relationship strength, follow-up toggles
- Archived toggle
- Global text search across name/email/company

Actions:
- Create / edit via [contact-form.tsx](../src/components/crm/contact-form.tsx) SidePanel
- Bulk archive / restore
- Delete with confirmation
- Bulk CSV/Excel import (see [Import Wizard](#13-import-wizard))

#### Campaigns tab — [campaigns-tab.tsx](../src/components/crm/campaigns-tab.tsx)
Group contacts into outreach batches. Create, edit, activate/deactivate.

#### Templates tab — [templates-tab.tsx](../src/components/crm/templates-tab.tsx)
Reusable message templates with channel, stage, family/angle/audience metadata, and placeholder support. Use-count tracked via `increment_template_use()` trigger.

### Contact detail — [src/app/dashboard/crm/contacts/[id]/page.tsx](../src/app/dashboard/crm/contacts/[id]/page.tsx) / [contact-detail-view.tsx](../src/components/crm/contact-detail-view.tsx)
Full page with:
- Inline-editable core fields (name, email, phone, etc.)
- **Interactions timeline** — [interactions-timeline.tsx](../src/components/crm/interactions-timeline.tsx) — polymorphic activity log, new interactions added via [interaction-form.tsx](../src/components/crm/interaction-form.tsx)
- **Automation history** — [contact-automation-history.tsx](../src/components/automations/contact-automation-history.tsx) — rules that fired for this contact
- **Draft sets** — [draft-sets-section.tsx](../src/components/crm/draft-sets-section.tsx) — message variants per channel/stage
- Custom fields via [DynamicFieldGroups](../src/components/shared/dynamic-field-group.tsx) driven by `field_definitions`
- Organization links (many-to-many via `contact_organizations`)

Legacy redirects: `/dashboard/contacts` and `/dashboard/contacts/:id` redirect to the CRM routes.

---

## 4. Organizations

### Org list — [src/app/dashboard/organizations/page.tsx](../src/app/dashboard/organizations/page.tsx)
- Search, type filter (company, agency, vc_firm, community, recruiting_firm), archived toggle
- Column toggling via [ColumnToggle](../src/components/shared/column-toggle.tsx)
- CRUD via [org-form.tsx](../src/components/organizations/org-form.tsx) modal
- Bulk import via [Import Wizard](#13-import-wizard)
- Archive / restore / delete

### Org detail — [src/app/dashboard/organizations/[id]/page.tsx](../src/app/dashboard/organizations/[id]/page.tsx) / [org-detail.tsx](../src/components/organizations/org-detail.tsx)
- Core metadata, notes, tags
- Linked contacts with role and tenure
- Custom fields from `field_definitions`
- Extended JSONB data

---

## 5. Tasks

### Tasks page — [src/app/dashboard/tasks/page.tsx](../src/app/dashboard/tasks/page.tsx)

Left sidebar — [stream-list.tsx](../src/components/tasks/stream-list.tsx):
- All task streams with counts
- Stream selection filter
- Create new stream

Three view modes (localStorage-persisted):
- **List view** — [task-list.tsx](../src/components/tasks/task-list.tsx) — sortable task table
- **Board view** — [task-board-view.tsx](../src/components/tasks/task-board-view.tsx) — Kanban columns per status with drag-and-drop + inline quick-add
- **Recurring view** — [series-list-view.tsx](../src/components/tasks/series-list-view.tsx) — task series/templates

Toolbar filters:
- Stream
- Status, priority, assignee
- Archived toggle
- Refresh, create-task

### Task form — [task-form.tsx](../src/components/tasks/task-form.tsx)
Dialog-based editor with:
- Linear-style title (auto-resizing textarea)
- Status, priority, due date, assignee (human or agent) as inline `h-6` tokens
- **Comment thread** — [comment-thread.tsx](../src/components/tasks/comment-thread.tsx) + [comment-form.tsx](../src/components/tasks/comment-form.tsx) with `@agent` mention autocomplete ([mention-autocomplete.tsx](../src/components/tasks/mention-autocomplete.tsx))
- **Attachments** — [task-attachments.tsx](../src/components/tasks/task-attachments.tsx) — link to documents, assets, or external URLs
- **Recurrence** — [recurrence-picker.tsx](../src/components/tasks/recurrence-picker.tsx) — daily / weekdays / weekly / monthly / every N days; workspace-timezone aware
- [recurrence-scope-dialog.tsx](../src/components/tasks/recurrence-scope-dialog.tsx) prompts for scope (this occurrence / future / all) when editing a series

Deep links: `?task=<id>` opens task form; `?series=<id>` opens series editor drawer.

### Triggers
- `sync_task_completion()` — sets `completed_at` when status transitions to `done`
- `enqueue_task_assignment()` — creates `agent_inbox_items` when a task is assigned to an agent
- `enqueue_comment_mentions()` — creates `agent_inbox_items` when `@agent` is mentioned in a comment
- `sync_task_attachment_updated()` — touches task `updated_at` on attachment changes

---

## 6. Agents

### Agents list — [src/app/dashboard/agents/page.tsx](../src/app/dashboard/agents/page.tsx)
- **Fleet status strip** — clickable counts for online / paused / offline / error
- **Team grouping** — [agent-card.tsx](../src/components/agents/agent-card.tsx) rows grouped by `meta.team`
- Search by name/slug/description; filter by status or team
- Per-agent actions: edit, toggle pause/resume, delete

### Agent create wizard — [agent-create-wizard.tsx](../src/components/agents/agent-create-wizard.tsx)
Three steps:
1. **Template** — choose from `template/*` branches in the agent workspace repo (fetched via [/api/agents/templates](../src/app/api/agents/templates/route.ts) with 1-minute cache) or "Custom"
2. **Identity** — name, slug (auto-generated), emoji, description
3. **Telegram** — bot token field (collected but not yet persisted)

The server action [createAgentWithBranch](../src/app/dashboard/agents/actions.ts):
1. Validates slug (`[a-z0-9](?:-[a-z0-9])*`, not reserved)
2. Checks branch + DB uniqueness in parallel
3. Resolves branch name via [resolveAgentBranch](../src/lib/workspace/branch.ts) → `{workspace.slug}/{agent-slug}`
4. Creates branch from template (or default)
5. Patches `agent.json` with identity fields
6. Fills `USER.md` placeholders from workspace owner profile
7. Inserts `agents` row with `meta: { emoji, team, template_branch, telegram_token_env }`
8. Rolls back (deletes branch) on any downstream failure

### Agent detail — [src/app/dashboard/agents/[id]/page.tsx](../src/app/dashboard/agents/[id]/page.tsx) / [agent-detail-tabs.tsx](../src/components/agents/agent-detail-tabs.tsx)
Tabs:
- **Info** — status, domains, capabilities, manifest
- **Files** — live file tree + editor for the agent's git branch
  - [agent-file-tree.tsx](../src/components/agents/agent-file-tree.tsx)
  - [agent-file-editor.tsx](../src/components/agents/agent-file-editor.tsx)
  - Reads/writes via [/api/agents/[slug]/files](../src/app/api/agents/[slug]/files/) (GET tree, POST/PUT/DELETE individual files). SHA-based optimistic locking, auto-creates branch if missing, enqueues `update` command to agent on save
- **Boot documents** — documents tagged `boot:all` or `boot:<slug>` automatically loaded as agent context
- **Activity / inbox** — inbox items queued for this agent

### Agent command queue
[enqueueAgentCommand](../src/app/dashboard/agents/actions.ts) inserts into `agent_commands`. Actions split between:
- **Agent-scoped** — `update`, `restart`, `provision`, `approve_pairing`, `remove`
- **System-scoped** — `restart_gateway`, `update_all`, `restart_dispatcher`

Status lifecycle: `pending → leased → running → done | failed`.

---

## 7. Documents (Knowledge Base)

### Documents library — [src/app/dashboard/documents/page.tsx](../src/app/dashboard/documents/page.tsx)

Left sidebar folder tree — [folder-tree.tsx](../src/components/shared/folder-tree.tsx):
- Hierarchical folders with expand/collapse (state persisted to localStorage)
- Create / rename / delete
- Descendant counts
- Drag-and-drop for moving folders + documents (dnd-kit with 5px activation)

Two view modes:
- [document-list.tsx](../src/components/documents/document-list.tsx)
- [document-grid.tsx](../src/components/documents/document-grid.tsx)

Filters (URL-synced):
- Folder, text search, archived toggle
- **Boot filter** — all agents / specific agent / none — shows documents tagged for a given agent

Imports:
- Drag-and-drop markdown via [markdown-drop-zone.tsx](../src/components/documents/markdown-drop-zone.tsx)
- Converts markdown → Tiptap JSON via [markdown-to-tiptap.ts](../src/lib/documents/markdown-to-tiptap.ts)

### Document editor — [src/app/dashboard/documents/[id]/page.tsx](../src/app/dashboard/documents/[id]/page.tsx) / [document-editor.tsx](../src/components/documents/document-editor.tsx)
- Novel/Tiptap rich text editor with auto-save
- Title, folder, tags, boot-tag management ([boot-tag-manager.tsx](../src/components/documents/boot-tag-manager.tsx))
- Markdown export ([export-markdown.ts](../src/lib/documents/export-markdown.ts))
- Semantic search via pgvector embeddings on `documents.embedding`

### Boot tags
- `boot:all` — document loaded by every agent
- `boot:<agent-slug>` — document loaded only by the named agent
- Stored in the same `tags` array as regular tags; UI separates them visually

---

## 8. Assets

### Assets library — [src/app/dashboard/assets/page.tsx](../src/app/dashboard/assets/page.tsx)
Same folder-tree + two-view structure as Documents:
- [asset-grid.tsx](../src/components/assets/asset-grid.tsx) / [asset-list.tsx](../src/components/assets/asset-list.tsx)
- [asset-card.tsx](../src/components/assets/asset-card.tsx) with type icon, tags, description preview

Eleven asset types: `document`, `sop`, `research`, `image`, `video`, `audio`, `template`, `script`, `spreadsheet`, `link`, `other`.

Uploads via [asset-upload.tsx](../src/components/assets/asset-upload.tsx) using Supabase Storage (1-hour signed URLs for retrieval).

### Asset viewer — [src/app/dashboard/assets/[id]/page.tsx](../src/app/dashboard/assets/[id]/page.tsx) / [asset-viewer.tsx](../src/components/assets/asset-viewer.tsx)
Type-specific preview (inline content, embedded video/image, external link).

---

## 9. Automations

### Automation rules — [src/app/dashboard/automations/page.tsx](../src/app/dashboard/automations/page.tsx) / [automation-rules-table.tsx](../src/components/automations/automation-rules-table.tsx)
Rules watch contact/org changes and enqueue `agent_inbox_items`.

Rule shape ([automation-rule-form.tsx](../src/components/automations/automation-rule-form.tsx)):
- **Table** — `contacts` (extensible)
- **Field** — which column to watch
- **Condition** — `created` / `changed_to` / `changed_from` / `any_change`
- **Value** — target value for `changed_to` / `changed_from`
- **Target agent** — which agent receives the inbox item
- **Event type** — inbox event label (e.g. `contact_status_changed`)
- **Summary template** — human-readable summary for the queued item
- **Active toggle**

Evaluated by trigger `process_contact_automation()`.

### Inbox items
Durable work queue for agents. Claimed via RPC `lease_inbox_item(agent_id, lease_seconds)`, completed via `complete_inbox_item(item_id)`, or marked via `fail_inbox_item(item_id, reason)` (max attempts → dead_letter).

Statuses: `pending → leased → done | failed | dead_letter`.

Inbox section UI — [inbox-section.tsx](../src/components/automations/inbox-section.tsx).

---

## 10. Notifications

### Notification center — [src/app/dashboard/notifications/page.tsx](../src/app/dashboard/notifications/page.tsx) / [notification-feed.tsx](../src/components/notifications/notification-feed.tsx)
Types: `follow_up`, `stale_contact`, `agent_suggestion`, `task_reminder`, `system`.

Features:
- Tab filters (All / Unread / by type) with unread-count badges
- Mark as read / unread, mark-all-read, dismiss
- Entity linking (click-through to underlying record)

Hook: [use-notifications.ts](../src/hooks/use-notifications.ts).

---

## 11. Activity Log

### Audit feed — [src/app/dashboard/activity/page.tsx](../src/app/dashboard/activity/page.tsx) / [activity-feed.tsx](../src/components/activity/activity-feed.tsx)
Paginated chronological feed of `audit_log` entries.

Filters ([activity-filters.tsx](../src/components/activity/activity-filters.tsx)):
- Module (`crm`, `tasks`, `assets`, `agents`, `documents`, `automations`, `settings`)
- Action (`created`, `updated`, `deleted`, `archived`, etc.)
- Actor (human / agent / specific agent)
- Entity type, date range

Each entry ([activity-item.tsx](../src/components/activity/activity-item.tsx)) shows actor, action, timestamp, changes diff, and links to the affected entity.

All mutations across modules write here via [logAudit()](../src/lib/audit/log.ts).

---

## 12. Settings

Entry page — [src/app/dashboard/settings/page.tsx](../src/app/dashboard/settings/page.tsx) — links to four sub-pages.

### General — [settings/general/page.tsx](../src/app/dashboard/settings/general/page.tsx)
- Workspace name / slug (auto-slugify) / description
- Owner profile: full name, preferred name (used by agents), timezone (Intl auto-detect + searchable dropdown)
- Updates `workspace` row; audit-logged

### Pipeline — [settings/pipeline/page.tsx](../src/app/dashboard/settings/pipeline/page.tsx)
Configure `pipeline_stages` per entity type (contact, organization):
- Add / rename / color-pick / reorder / delete stages
- Per-stage: terminal toggle, default toggle (one per entity type)
- Slug auto-generated from label

### Fields — [settings/fields/page.tsx](../src/app/dashboard/settings/fields/page.tsx)
Configure `field_definitions` per entity type:
- Field types: `text`, `textarea`, `number`, `boolean`, `url`, `select`, `multiselect`, `date`
- Per-field: label, key (auto), group, required, active, description, options (for selects)
- Grouped display in detail views via [DynamicFieldGroups](../src/components/shared/dynamic-field-group.tsx)

### System — [settings/system/page.tsx](../src/app/dashboard/settings/system/page.tsx)
Operational controls:
- **System action buttons** — Restart Gateway, Update All Agents, Restart Dispatcher (each with confirm dialog)
- **Command history** — filtered list of `agent_commands` (All / Pending / Running / Done / Failed)
  - Status dot, action, agent slug, relative timestamp
  - Expandable stdout/stderr/error output + exit code
  - Pagination via Load More

---

## 13. Import Wizard

Multi-step bulk importer used by CRM and Organizations — [src/components/import/](../src/components/import/).

| Step | File | What it does |
|---|---|---|
| Upload | [upload-step.tsx](../src/components/import/upload-step.tsx) | CSV/Excel file upload; header detection |
| Mapping | [mapping-step.tsx](../src/components/import/mapping-step.tsx) | Column → field mapping with auto-detect from label similarity |
| Preview | [preview-step.tsx](../src/components/import/preview-step.tsx) | Per-row validation, duplicate detection (email/phone), skip/merge strategy |
| Import | [import-step.tsx](../src/components/import/import-step.tsx) | Batch insert with progress; reports failures |

Helpers: [parse.ts](../src/lib/import/parse.ts), [mapping.ts](../src/lib/import/mapping.ts), [validate.ts](../src/lib/import/validate.ts), [transform.ts](../src/lib/import/transform.ts), [execute.ts](../src/lib/import/execute.ts).

---

## 14. Cross-cutting features

### Real-time sync
- Supabase Postgres Changes channels via [use-realtime.ts](../src/hooks/use-realtime.ts)
- Convenience hook [use-realtime-sync.ts](../src/hooks/use-realtime-sync.ts) auto-merges INSERT/UPDATE/DELETE events into local state
- Instance-scoped channel names prevent collisions across components

### Audit logging
- Every create/update/delete mutation calls [logAudit](../src/lib/audit/log.ts)
- Fire-and-forget: never blocks the mutation
- [diffChanges](../src/lib/audit/log.ts) computes before/after diff for the `changes` JSONB column
- Actor auto-resolved: `human` (default), `agent` (when acting via service role), `system` (for trigger-generated entries)

### Dynamic fields
- `field_definitions` table drives form rendering
- [DynamicField](../src/components/shared/dynamic-field.tsx) is polymorphic per `field_type`
- Values stored on the owning row's `extended` JSONB column
- Deactivating a field preserves data but hides it

### Pipeline stages
- `pipeline_stages` table drives status dropdowns, kanban columns, dashboard pipeline cards
- Per-entity-type (contact, organization) with color, terminal flag, default flag
- Fetched via [usePipelineStages](../src/hooks/use-pipeline-stages.ts)

### Command palette — [command-center.tsx](../src/components/shared/command-center.tsx)
Global Cmd+K search-and-navigate palette.

### URL state persistence
Filters and active tabs are synced to search params so views are shareable/bookmarkable: CRM tabs, contact filters, document folder/search/boot filter, task deep links, activity filters.

### View mode persistence (localStorage)
- `tasks-view-mode` — list / board / recurring
- `documents-view-mode` — list / grid
- `assets-view-mode` — list / grid
- `documents.expandedFolders`, `assets.expandedFolders` — tree state

### Drag-and-drop (dnd-kit)
- Tasks kanban status changes
- Contacts kanban pipeline changes
- Folder/document/asset moves
- PointerSensor with 5px activation to distinguish drag from click

### GitHub integration ([src/lib/github/client.ts](../src/lib/github/client.ts))
Octokit wrapper used by agent file management:
- `branchExists`, `createBranch`, `deleteBranch`
- `getTree`, `getFileContent`, `createFile`, `updateFile`, `deleteFile`
- `createCommit` for multi-file commits
- Used through [resolveAgentBranch](../src/lib/workspace/branch.ts) which prefixes the workspace slug

---

## 15. Keyboard shortcuts

| Key | Action |
|---|---|
| `⌘K` | Open command palette |
| `⌘B` | Toggle sidebar |
| `G D` | Dashboard home |
| `G C` | CRM |
| `G T` | Tasks |
| `G A` | Assets |
| `G L` | Activity log |
| `G G` | Agents |
| `?` | Keyboard shortcuts help |
| `Enter` (in forms) | Submit |
| `Escape` | Close dialog / panel |

---

## 16. API & server actions reference

### Server actions

| Action | File | Purpose |
|---|---|---|
| `completeSetup` | [app/setup/actions.ts](../src/app/setup/actions.ts) | Atomically seed workspace + stages + fields + streams via RPC |
| `fetchDashboardStats` | [app/dashboard/actions.ts](../src/app/dashboard/actions.ts) | Aggregated home-page stats |
| `createAgentWithBranch` | [app/dashboard/agents/actions.ts](../src/app/dashboard/agents/actions.ts) | Create agent + git branch + rollback-on-failure |
| `enqueueAgentCommand` | [app/dashboard/agents/actions.ts](../src/app/dashboard/agents/actions.ts) | Queue agent-scoped or system-scoped command |

### API routes (agent file management)

| Route | Methods | Purpose |
|---|---|---|
| `/api/agents/templates` | GET | List `template/*` branches in workspace repo (1-min cache) |
| `/api/agents/[slug]/files` | GET | File tree for agent branch; creates branch if missing |
| `/api/agents/[slug]/files/[...path]` | GET | Read file content + SHA |
| `/api/agents/[slug]/files/[...path]` | POST | Create new file |
| `/api/agents/[slug]/files/[...path]` | PUT | Update file (SHA-checked); enqueues `update` command |
| `/api/agents/[slug]/files/[...path]` | DELETE | Delete file (SHA-checked) |

All API routes require an authenticated Supabase session and write to the audit log.

### Supabase RPCs used by the UI

| RPC | Purpose |
|---|---|
| `complete_setup` | One-shot workspace initialization |
| `lease_inbox_item(agent_id, lease_seconds)` | Claim next pending inbox item with row lock |
| `complete_inbox_item(item_id)` | Mark inbox item done |
| `fail_inbox_item(item_id, reason)` | Mark inbox item failed; max-attempts auto-promotes to dead_letter |
| `increment_template_use(template_id)` | Bump template use counter |

See [SCHEMA.md](./SCHEMA.md) for full schema and trigger details.
