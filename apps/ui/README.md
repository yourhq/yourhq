# HQ

A single-user operations dashboard — CRM, task management, AI agent orchestration, knowledge base, and asset library — built on Next.js + Supabase.

The workspace is **runtime-configurable**: pipelines, custom fields, streams, and agents are all defined through the UI so the same codebase works for any workstream without code changes.

---

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- **Supabase** — Postgres, Auth, Row-Level Security, Realtime, Storage, pgvector
- **Tailwind CSS 4** + **shadcn/ui** (Radix primitives, New York style)
- **TanStack React Table** for data grids, **Novel/Tiptap** for rich text, **dnd-kit** for drag-and-drop
- **Octokit** for per-agent GitHub branch management

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME   (for agent workspace repo)

# 3. Apply database migrations
#    Run files in supabase/migrations/ in order against your Supabase project.

# 4. Run
npm run dev        # http://localhost:3000
npm run build
npm run lint
npx tsc --noEmit   # type-check (expected: zero errors)
```

On first login you are routed through a six-step setup wizard that seeds the workspace, pipeline stages, custom fields, and task streams.

---

## Modules

| Module | Route | What it does |
|---|---|---|
| **Dashboard** | `/dashboard` | Pipeline, task, agent, and follow-up rollups + recent activity |
| **CRM** | `/dashboard/crm` | Contacts (table/cards/kanban), campaigns, templates, draft sets, interactions timeline |
| **Organizations** | `/dashboard/organizations` | Companies, agencies, communities; many-to-many contact links |
| **Tasks** | `/dashboard/tasks` | Streams, list/board/recurring views, comments with `@agent` mentions, attachments |
| **Agents** | `/dashboard/agents` | Agent registry, template-based creation, git branch file editor, command queue |
| **Documents** | `/dashboard/documents` | Knowledge base with Novel editor, folders, boot-tags for agent context, semantic search |
| **Assets** | `/dashboard/assets` | File library with folders and 11 asset types |
| **Automations** | `/dashboard/automations` | Rules that enqueue agent inbox items on CRM changes |
| **Notifications** | `/dashboard/notifications` | Follow-ups, agent suggestions, task reminders |
| **Activity** | `/dashboard/activity` | Cross-module audit log |
| **Settings** | `/dashboard/settings` | Workspace profile, pipelines, custom fields, system commands |

Full feature reference: **[docs/FEATURES.md](docs/FEATURES.md)**.

---

## Architecture at a glance

```
src/
├── app/                     # Next.js App Router
│   ├── login/               # Supabase email/password
│   ├── setup/               # First-run wizard (server action: completeSetup)
│   ├── api/agents/          # Git file CRUD + template listing
│   └── dashboard/           # All modules live here
├── components/
│   ├── ui/                  # shadcn primitives
│   ├── shared/              # DataTable, SidePanel, DynamicField, FolderTree, …
│   └── <module>/            # CRM, tasks, agents, documents, assets, automations, …
├── hooks/                   # useContacts, useTasks, useAgents, useRealtimeSync, …
├── lib/
│   ├── supabase/            # Browser, server, and middleware clients
│   ├── <module>/types.ts    # Per-module types + enums
│   ├── audit/log.ts         # logAudit() + diffChanges()
│   ├── github/client.ts     # Octokit wrapper for agent branches
│   └── workspace/           # Workspace singleton + branch resolution
└── middleware.ts            # Auth redirect
supabase/migrations/         # Ordered SQL migrations (001–018)
docs/                        # Feature + module docs (see below)
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for detail.

---

## Key design choices

- **Dark-only, Linear-inspired UI** with OKLch tokens. See [docs/UI_PATTERNS.md](docs/UI_PATTERNS.md).
- **Runtime-configurable schema** — `pipeline_stages` + `field_definitions` drive forms, detail views, and kanban columns. Add a field in Settings and it appears everywhere without a deploy.
- **Polymorphic activity log** — `interactions` table replaces per-entity logs; `audit_log` captures all CRUD across modules.
- **Agent orchestration via Supabase + GitHub** — each agent gets a git branch (`{workspace-slug}/{agent-slug}`); files are edited in-app with SHA-based optimistic locking; `agent_commands` is a durable command queue; `agent_inbox_items` is a lease-based work queue populated by triggers and automation rules.
- **Boot-tag knowledge** — documents tagged `boot:all` or `boot:<agent-slug>` are loaded automatically as agent context.
- **Audit everything** — fire-and-forget `logAudit()` on every mutation; no extra round-trip latency.

---

## Documentation map

| Doc | Scope |
|---|---|
| [docs/FEATURES.md](docs/FEATURES.md) | Full feature catalogue with file links |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, auth flow, module layout |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema — tables, triggers, RLS, functions |
| [docs/UI_PATTERNS.md](docs/UI_PATTERNS.md) | Design system, forms, colors, component recipes |
| [docs/CRM.md](docs/CRM.md) | Contacts, templates, campaigns, draft sets |
| [docs/TASKS.md](docs/TASKS.md) | Streams, tasks, comments, recurring tasks |
| [docs/AGENTS.md](docs/AGENTS.md) | Agent registry, inbox, automation rules, boot tags |
| [docs/ASSETS.md](docs/ASSETS.md) | Asset library and storage |
| [docs/DOCUMENTS.md](docs/DOCUMENTS.md) | Knowledge base, Tiptap content format, boot tags |
| [CLAUDE.md](CLAUDE.md) | Project instructions for Claude Code |

---

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

GITHUB_TOKEN=ghp_...              # PAT with repo scope
GITHUB_REPO_OWNER=<owner>         # Agent workspace repo owner
GITHUB_REPO_NAME=<repo>           # Agent workspace repo name
```

The agent workspace repo should have `template/*` branches for each agent template and a default branch for custom agents.

---

## Database migrations

The entire schema lives in a single consolidated file meant for a fresh Supabase project:

```bash
psql "$DATABASE_URL" -f supabase/migrations/001_command_center.sql
```

It creates all tables, enums, triggers, RLS policies, the `supabase_realtime` publication, the `assets` storage bucket, the pg_cron schedule for recurring task spawning, and the `complete_setup` RPC used by the first-run wizard. See [docs/SCHEMA.md](docs/SCHEMA.md) for full details.
