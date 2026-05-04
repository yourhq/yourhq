# CLAUDE.md — HQ

## What this repo is

HQ is the monorepo for the [yourhq.ai](https://yourhq.ai) platform. It contains:

- **`apps/ui/`** — the Next.js UI (admin dashboard: CRM, tasks, agents, knowledge, routines, collections).
- **`gateway/`** — the gateway runtime: Dockerfiles, entrypoint, Python daemons (inbox dispatcher, command runner, file processor, source sync, embedder), and lifecycle shell scripts.
- **`templates/`** — agent template library (one directory per template).
- **`db/migrations/`** — Postgres/Supabase SQL migrations. Run files in filename order.
- **`installer/install.sh`** — interactive installer for OSS self-host (`curl | bash` target).
- **`docker-compose.yml` / `docker-compose.dev.yml`** — full stack. UI runs standalone; gateway services (gateway, dispatcher, runner, embedder, file-processor) are behind a `gateway` Compose profile.

Supabase (your own project) is the only shared state between UI and gateway — the UI writes to `agent_commands`, daemons subscribe via Realtime and execute on their host. There is no direct network link between UI and gateway.

## Architectural shape

- **Multi-project UI**: one UI instance manages N independent Supabase projects via the project registry. Each Supabase is a fully-isolated workspace — no multi-tenant RLS gymnastics.
- **Multi-gateway per project**: each Supabase can have multiple gateways (different hosts, different geos). Every agent has a `gateway_id`; daemons filter their command queue by their `GATEWAY_ID` env.
- **Local-git-volume default**: each gateway owns a bare git repo in a Docker volume. Per-agent branches live there. Templates from `/opt/templates/` (baked into the gateway image) seed this repo on first boot. Optional `GIT_REMOTE_URL` lets users sync to GitHub/Gitea for backup.
- **Remote desktop** via noVNC served from the gateway container. Tailscale is the recommended network path (private, no port exposure); public HTTPS (Caddy + Let's Encrypt) and local-only are alternatives.
- **Usage budgets and org chart**: agent usage is recorded in `agent_usage`, budgets roll up in `agent_budgets`, and `agents.reports_to_id` gives runtime delegation context.

## Key commands

```bash
# UI only
docker compose up -d ui

# UI + local gateway (full stack)
docker compose --profile gateway up -d
docker compose logs -f                 # tail all
docker compose logs -f gateway         # one service

# Live-reload development
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# UI-only commands (run inside apps/ui/)
cd apps/ui
npm install --legacy-peer-deps
npm run dev
npm run build
npx tsc --noEmit     # type check

# Run the interactive installer locally
./installer/install.sh
```

## UI module reference

Inside `apps/ui/src/`:

- `app/` — App Router pages (dashboard, login, setup wizard).
- `components/` — UI module folders: `crm/`, `tasks/`, `agents/`, `knowledge/`, `collections/`, `routines/`, `inbox/`, `notifications/`, etc. + `shared/` for cross-module + `ui/` for shadcn primitives.
- `hooks/` — data-fetching hooks (`use-contacts.ts`, `use-agents.ts`, `use-knowledge.ts`, `use-collections.ts`, `use-routines.ts`, etc.).
- `lib/` — domain types + Supabase clients + audit log helpers. Modules: `knowledge/`, `collections/`, `routines/`, `inbox/`, `entity-links/`, `audit/`, `tasks/`, etc.

For the public-facing tour of the system, see [`docs-site/concepts/architecture.mdx`](docs-site/concepts/architecture.mdx).

## Gateway runtime

`gateway/entrypoint.sh` orchestrates:

1. Seed local bare git repo from `/opt/templates/` (or `$TEMPLATES_SOURCE`).
2. Optionally attach to `$GIT_REMOTE_URL`.
3. Optionally bring up Tailscale (`$TAILSCALE_AUTH_KEY`) and apply `$TAILSCALE_EXIT_NODE`.
4. Run `openclaw onboard` on first boot.
5. Patch `openclaw.json` (browser, channels, plugin paths).
6. Install the hq-bootstrap plugin.
7. Start Xtigervnc + XFCE desktop.
8. Start websockify → noVNC, binding per `$NOVNC_BIND` (local / off). Port 6901 is internal-only — the UI proxies it through `/api/novnc`.
9. Upsert this gateway's row in Supabase with its reachable URLs.
10. Exec `openclaw gateway start` as the main process.

Daemons:

- `gateway/daemons/inbox_dispatcher.py` — watches `agent_inbox_items`, wakes agents via `openclaw agent`. Filters by `GATEWAY_ID` — only wakes agents bound to this gateway.
- `gateway/daemons/command_runner.py` — watches `agent_commands`, leases via `lease_command(p_gateway_slug=GATEWAY_ID)`, executes shell commands. Heartbeats to the `gateways` table every 30s.
- `gateway/daemons/file_processor.py` — leases `knowledge_items` with `kind='file'` and `processing_status='ready'`, downloads from storage, extracts text (PDF, DOCX, XLSX, CSV, PPTX, TXT), updates `plain_text` and triggers embedding.
- `gateway/daemons/source_sync.py` — syncs external source connections (Notion, Google Drive). Polls `source_connections` where `next_sync_at <= now()`, fetches changes, upserts `knowledge_items` with `kind='source'`.
- `gateway/embedder/embedder.py` — leases `knowledge_items` pending embedding via `lease_knowledge_items_for_indexing`, generates vector embeddings, creates chunks. HTTP server at `:9100` with `/embed` and `/healthz` endpoints.

## Database

`db/migrations/` contains 25 ordered migrations (001–025). Key tables:

- `gateways` — one row per gateway host. Seeded with a `default` row so single-gateway setups work immediately.
- `agents` — agent definitions with `gateway_id`, `reports_to_id` hierarchy.
- `knowledge_folders` / `knowledge_items` / `knowledge_item_agents` / `knowledge_chunks` — unified knowledge system. Items have `kind` (page/playbook/file/source), `scope` (workspace/agent), embedding pipeline fields. Agent-scoped items use the junction table.
- `entity_links` — universal polymorphic linking. Any owner (task, routine, collection_record, agent) can link to any target (knowledge_item, collection_record, contact, organization, task, url).
- `routines` — scheduled and event-driven agent behaviors. Has `trigger_type` (schedule/event), cadence fields (sub-daily to monthly), and event fields (entity_type, field, condition, value).
- `collection_definitions` / `collection_fields` / `collection_records` / `collection_views` — user-defined tables with typed JSONB fields and saved views (table/kanban/calendar).
- `source_connections` / `source_sync_runs` — external source integrations (Notion, Google Drive).
- `agent_commands` / `agent_inbox_items` — command queue and inbox for agent execution.
- `agent_usage` / `agent_budgets` — append-only LLM usage plus per-agent budget rollups.
- `tenants` — multi-tenant support via `tenant_id` on all tables, scoped RLS via `current_tenant_id()`.

Key RPCs: `search_knowledge_items()`, `search_knowledge_chunks()`, `lease_knowledge_items_for_indexing()`, `lease_knowledge_items_for_processing()`, `routine_next_occurrence()`, `spawn_routine_schedule_items()`, `lease_command()`, `get_agent_daily_usage()`.

RLS: All tables use tenant-scoped policies via `current_tenant_id()` JWT claim. OSS uses a single default tenant (`00000000-0000-0000-0000-000000000000`). The `service_role` key bypasses RLS.

## Conventions

- **Code references**: use markdown link syntax when pointing the user at real files and specific lines.
- **Supabase migrations**: always include explicit `GRANT` statements for `authenticated` and `service_role`. The project's Supabase setup does not grant these by default. *(Saved as memory — see user preferences.)*
- **New UI modules**: follow the existing pattern — types in `lib/<module>/types.ts`, hooks in `hooks/use-<module>.ts`, components in `components/<module>/`.
- **New daemon actions**: add the case to `command_runner.py`'s `build_command()`, add or migrate the `command_action` enum, and expose it as a server action in `apps/ui/src/app/dashboard/agents/actions.ts`.
- **Dockerfile edits**: multi-arch build (amd64 + arm64) is the target. Use `TARGETARCH` arg when installing arch-specific binaries (Chrome vs Chromium, Tailscale, Caddy).
- **Comments**: default to none. Only add one when the *why* is non-obvious (a hidden constraint, a subtle invariant, a workaround). Don't narrate what the code does.

## Current Roadmap Shape

- Shipped: self-hosted stack, browser onboarding, multi-project registry, UI-driven gateway registration, provider connections, noVNC modal, usage budgets, agent hierarchy, unified knowledge (pages/playbooks/files/sources), entity links, routines (schedule + event), collections (table/kanban/calendar views), file processing pipeline, source connections (Notion), modular onboarding, task calendar view, and agent-initiated skill learning (playbook auto-creation with version history).
- Next: Google Drive sync, public deployment docs, richer pricing coverage, template docs, and docs site generation.
- Later: hosted offering with account management, automated provisioning, and billing.

Current plan file: `/Users/prajoth/.claude/plans/resilient-dancing-koala.md`.
