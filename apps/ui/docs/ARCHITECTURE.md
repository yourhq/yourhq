# Architecture Reference

## System Overview

HQ is a Next.js 16 admin dashboard backed by Supabase. It's a single-user application — the human owner plus the AI agents they operate. There is no multi-tenant isolation; RLS exists only to gate anonymous access.

```
┌─────────────────────────────────────────────────────┐
│                  HQ UI                   │
│              (Next.js 16 App Router)                 │
│                                                      │
│  Dashboard · CRM · Organizations · Tasks · Agents   │
│  Documents · Assets · Automations · Notifications   │
│  Activity · Settings                                 │
└─────────┬───────────────────────────────┬───────────┘
          │                               │
          ▼                               ▼
 ┌──────────────────┐            ┌──────────────────┐
 │     Supabase     │            │  Agent workspace │
 │   (PostgreSQL    │            │   GitHub repo    │
 │   + Auth + RLS   │            │                  │
 │   + Realtime     │            │  One branch per  │
 │   + Storage      │            │  agent, managed  │
 │   + pgvector)    │            │  via Octokit     │
 └──────┬───────────┘            └──────────────────┘
        │
        ▼
 ┌──────────────────┐
 │   AI Agents      │
 │  (external       │
 │  processes)      │
 │                  │
 │  Write directly  │
 │  to Supabase     │
 │  via service-    │
 │  role key        │
 └──────────────────┘
```

Everything agent-facing — contacts, tasks, inbox queue, documents, audit log — lives in Supabase. The GitHub integration exists only to give each agent an editable workspace (its own branch in a separate repo); the HQ UI surfaces that branch as a file browser and wires file changes into the agent command queue.

## Authentication

1. Request hits [middleware.ts](../src/middleware.ts), which calls `updateSession()` ([lib/supabase/middleware.ts](../src/lib/supabase/middleware.ts)) to refresh the Supabase auth cookie.
2. Unauthenticated user not on `/login` or `/auth` → redirect to `/login`.
3. Authenticated user on `/login` → redirect to `/dashboard`.
4. [dashboard/layout.tsx](../src/app/dashboard/layout.tsx) performs a second server-side `getUser()` check; then checks `workspace.initialized` and redirects to `/setup` if the first-run wizard hasn't completed.
5. Authenticated children render inside [dashboard-shell.tsx](../src/components/dashboard-shell.tsx).

Auth is Supabase email/password. Single user — no multi-tenant isolation.

## Data flow patterns

### Client-side fetching (most pages)

```
Client page
 └─ useMemo(() => createClient())        browser Supabase client
    └─ supabase.from("table").select()   direct query
    └─ state in useState + useEffect
    └─ logAudit() on mutations           fire-and-forget audit
    └─ useRealtimeSync()                 auto-merge INSERT/UPDATE/DELETE
```

Custom hooks (`useContacts`, `useTasks`, `useAgents`, …) encapsulate fetch + filter + CRUD + form state so pages stay thin.

### Server-side fetching (detail pages)

```
Server page (async)
 └─ createClient() from server.ts        cookie-bound client
    └─ fetch entity by ID
    └─ pass as props to client components
```

### Server actions

| Action | Purpose |
|---|---|
| [completeSetup](../src/app/setup/actions.ts) | Atomically seed workspace + pipeline stages + field definitions + streams via RPC |
| [fetchDashboardStats](../src/app/dashboard/actions.ts) | Aggregate counts and recent activity for the home page |
| [createAgentWithBranch](../src/app/dashboard/agents/actions.ts) | Create agent DB row + git branch; rolls back the branch on failure |
| [enqueueAgentCommand](../src/app/dashboard/agents/actions.ts) | Queue an agent- or system-scoped command |

### Realtime

`useRealtime` subscribes to Supabase Postgres Changes. `useRealtimeSync` wraps it and auto-merges events into React state. Instance-scoped channel names prevent collisions when the same table is watched by multiple components.

Every table is in the `supabase_realtime` publication with `REPLICA IDENTITY FULL` so updates emit full rows.

## Module architecture

Each module follows the same shape: one or two pages under `src/app/dashboard/<module>/`, a bundle of components under `src/components/<module>/`, and a types file under `src/lib/<module>/types.ts`.

### CRM — [docs/CRM.md](./CRM.md)
Contacts, organizations (linked via `contact_organizations`), interactions timeline, campaigns, templates, draft sets. Status field validated against `pipeline_stages`; custom fields driven by `field_definitions`. Three view modes (table/cards/kanban).

### Organizations
Same model as contacts — separate table with its own `extended` JSONB and its own rows in `pipeline_stages` / `field_definitions` (`entity_type = 'organization'`).

### Tasks — [docs/TASKS.md](./TASKS.md)
Streams group tasks by work area. Three view modes (list/board/recurring). Tasks support comments with `@agent` mentions, attachments to documents/assets/URLs, and recurrence via `task_series`.

### Agents — [docs/AGENTS.md](./AGENTS.md)
Registry plus a GitHub-backed per-agent file tree. Agent creation wizard forks a `template/*` branch and patches identity into `agent.json`. The file editor reads/writes through API routes at `/api/agents/[slug]/files/...` and enqueues an `update` command on save. Durable work queue via `agent_inbox_items`; system commands via `agent_commands`.

### Documents — [docs/DOCUMENTS.md](./DOCUMENTS.md)
Knowledge base using Novel/Tiptap. Folder hierarchy. Boot tags (`boot:all`, `boot:<slug>`) mark documents as agent context. pgvector embeddings on `documents.embedding` for semantic search.

### Assets — [docs/ASSETS.md](./ASSETS.md)
File library with folder hierarchy and 11 asset types. Files live in the Supabase `assets` storage bucket; signed URLs generated on demand.

### Automations
Rules in `automation_rules` watch contact/org changes and enqueue `agent_inbox_items` via the `process_contact_automation()` trigger. Task assignment and `@agent` mentions also enqueue inbox items through their own triggers.

### Notifications
`notifications` table feeds a simple unread/dismiss UI. Types: `follow_up`, `stale_contact`, `agent_suggestion`, `task_reminder`, `system`.

### Activity
Cross-module audit log. Every create/update/delete in the app calls [logAudit](../src/lib/audit/log.ts) which writes to `audit_log`. Fire-and-forget — never blocks the mutation.

### Settings
Runtime configuration — workspace profile, pipeline stages, field definitions, system commands. Changes take effect immediately; no deploy.

## Runtime-configurable schema

Two tables make the app workstream-agnostic:

- **`pipeline_stages`** drives status dropdowns, kanban columns, dashboard pipeline card. Keyed by `entity_type` (`contact`, `organization`, …).
- **`field_definitions`** drives form sections, detail-view property blocks, and the column picker. Also keyed by `entity_type`. Fields get stored in the row's `extended` JSONB column, never as new columns.

Adding a field in Settings takes immediate effect everywhere without a deploy.

## Agent workspace & GitHub integration

Each agent gets a branch in a separate "agent workspace" repo. Branch name: `{workspace.slug}/{agent-slug}` (resolved by [resolveAgentBranch](../src/lib/workspace/branch.ts)).

The file editor at `/dashboard/agents/[id]` (Files tab) reads/writes via [/api/agents/[slug]/files/...](../src/app/api/agents/[slug]/files/) using Octokit ([lib/github/client.ts](../src/lib/github/client.ts)). SHA-based optimistic locking guards against concurrent edits. Every write:

1. Commits the file change to the branch
2. Logs an audit entry
3. Enqueues an `update` command in `agent_commands` so the running agent can pull and restart

Agent templates are `template/*` branches in the same repo, discovered at creation time via `/api/agents/templates` (with a 1-minute in-memory cache).

## Command queue

`agent_commands` is a durable, persistent command queue — not direct RPC. Agents poll or subscribe and drain it at their own cadence.

- **Agent-scoped**: `provision`, `approve_pairing`, `update`, `restart`, `remove`
- **System-scoped**: `restart_gateway`, `update_all`, `restart_dispatcher`

Lifecycle: `pending → leased → running → done | failed`. Command history is visible at `/dashboard/settings/system` with expandable stdout/stderr.

## Inbox queue (automation)

`agent_inbox_items` is the work queue — separate from `agent_commands`. Populated by triggers:

- `enqueue_task_assignment` — fires when a task's `assignee_agent_id` is set
- `enqueue_comment_mentions` — fires when an agent is `@mentioned` in a comment
- `process_contact_automation` — evaluates `automation_rules` on contact insert/update

Agents claim work via `lease_inbox_item(agent_id, lease_seconds)` RPC — atomic row lock — and complete via `complete_inbox_item` or `fail_inbox_item` (which auto-promotes to `dead_letter` after `max_attempts`).

## Audit logging

Every mutation calls [logAudit](../src/lib/audit/log.ts):

```ts
logAudit(supabase, {
  module: "crm",            // crm | tasks | assets | agents | documents | automations | settings
  entity_type: "contact",
  entity_id: id,
  action: "created",        // created | updated | deleted | archived | restored | …
  summary: "Human-readable description",
  changes: diffChanges(before, after),   // optional field-level diff
});
```

Fire-and-forget — never awaited, never blocks the caller. `actor_type` / `actor_agent_id` defaults to `human`; agents writing directly via the service role key set them explicitly.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Command palette |
| `⌘B` | Toggle sidebar |
| `?` | Keyboard help |
| `G D` | Dashboard |
| `G C` | CRM |
| `G T` | Tasks |
| `G A` | Assets |
| `G L` | Activity |
| `G G` | Agents |

## Error handling

- Middleware handles auth redirects centrally
- Server layouts do a second `getUser()` check as defense in depth
- Server actions throw; clients toast the error
- API routes return `NextResponse.json({ error }, { status })`
- `/dashboard/error.tsx` is the module-level error boundary with a reset button
- Audit logging is fire-and-forget and silently swallows failures
