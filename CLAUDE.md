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

- **Multi-workspace UI**: one UI instance manages N independent Supabase databases via the workspace registry. Each workspace is fully isolated. Within each database, every table enforces tenant-scoped RLS via `tenant_id`.
- **Multi-gateway per workspace**: each workspace can have multiple gateways (different hosts, different geos). Every agent has a `gateway_id`; daemons filter their command queue by their `GATEWAY_ID` env.
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

# Cut a release (bumps versions, tags, pushes, creates GitHub Release)
./scripts/release.sh 0.1.1
```

## Release process

Releases follow semver and are cut with `./scripts/release.sh <version>`. The script bumps versions in all packages, updates the CHANGELOG, commits, tags, and pushes. CI handles the rest:

1. Tag push → `docker-publish.yml` builds all images, pushes to GHCR + ECR with semver + `:latest` tags.
2. After images publish → `deploy-hosted.yml` deploys worker to ECS.
3. `e2b-template.yml` rebuilds the E2B gateway template.
4. `install.yourhq.ai` (Cloudflare Worker) auto-resolves the new tag within 5 minutes.

**Branch protection on `main`:** CI checks (`ui`, `worker`) must pass. Linear history required. No force pushes. Admin can push directly; external contributors must PR.

**Cadence:** scheduled releases every 2-4 weeks. Versioning: `0.1.x` for patches, `0.x.0` for features/breaking changes.

## UI module reference

Inside `apps/ui/src/`:

- `app/` — App Router pages (dashboard, login, setup wizard).
- `components/` — UI module folders: `crm/`, `tasks/`, `agents/`, `knowledge/`, `collections/`, `routines/`, `inbox/`, `notifications/`, `plugins/`, etc. + `shared/` for cross-module + `ui/` for shadcn primitives.
- `hooks/` — data-fetching hooks (`use-contacts.ts`, `use-agents.ts`, `use-knowledge.ts`, `use-collections.ts`, `use-routines.ts`, `use-task-relations.ts`, `use-labels.ts`, `use-deliverables.ts`, `use-task-templates.ts`, etc.).
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

- `gateway/daemons/inbox_dispatcher.py` — watches `agent_inbox_items`, wakes agents via `openclaw agent`. Filters by `GATEWAY_ID` — only wakes agents bound to this gateway. Enriches `task_assignment` inbox items with unresolved blocker information from `task_relations`.
- `gateway/daemons/command_runner.py` — watches `agent_commands`, leases via `lease_command(p_gateway_slug=GATEWAY_ID)`, executes shell commands. Heartbeats to the `gateways` table every 30s. Also subscribes to `secrets` table changes and triggers `sync_secrets()`.
- `gateway/daemons/secrets_sync.py` — fetches encrypted secrets from Supabase, decrypts with AES-256-GCM (key derived via HKDF from the service role key), and writes per-agent `.env` files to `~/.openclaw/secrets/`. Triggered by Realtime on the `secrets` table and a 5-minute safety re-sync. Started by command_runner on boot.
- `gateway/daemons/file_processor.py` — leases `knowledge_items` with `kind='file'` and `processing_status='ready'`, downloads from storage, extracts text (PDF, DOCX, XLSX, CSV, PPTX, TXT), updates `plain_text` and triggers embedding.
- `gateway/daemons/source_sync.py` — syncs external source connections via the plugin-based connector registry (`gateway/connectors/`). Polls `source_connections` where `next_sync_at <= now()`, fetches changes, upserts `knowledge_items` with `kind='source'`. Reads credentials from `~/.openclaw/secrets/gateway.env` (written by secrets_sync).
- `gateway/daemons/plugin_runner.py` — watches `hq_plugin_event_queue` (SQL-trigger-emitted events), dispatches to enabled plugins (local Python handlers or remote webhook POSTs with HMAC). Subscribes to `hq_plugins` for config changes. Polling fallback every 5s.
- `gateway/embedder/embedder.py` — leases `knowledge_items` pending embedding via `lease_knowledge_items_for_indexing`, generates vector embeddings, creates chunks. HTTP server at `:9100` with `/embed` and `/healthz` endpoints.
- `gateway/daemons/sentry_init.py` — shared Sentry initialization for all daemons. Only active when `SENTRY_DSN` is set and `RUNTIME_MODE` is `hosted` or `e2b` (never in self-hosted). Provides `init_sentry(daemon_name)` and `capture(exc)`.

Plugins:

- `gateway/plugins/sdk.py` — Plugin SDK: `BasePlugin`, `PluginContext`, `PluginEvent`, `StateClient`, `SecretsClient`, `SupabaseClient`. Local plugins subclass `BasePlugin` and implement `on_event()`.
- `gateway/plugins/_template/` — Scaffold for new plugins (manifest.json + handler.py).
- `gateway/plugins/usage-alerts/` — Built-in plugin: logs warnings when agents approach budget limits.
- `gateway/plugins/CONTRIBUTING.md` — Contributor guide for writing plugins.

## Database

`db/migrations/` contains 34 ordered migrations (001–033). Key tables:

- `gateways` — one row per gateway host. Seeded with a `default` row so single-gateway setups work immediately.
- `agents` — agent definitions with `gateway_id`, `reports_to_id` hierarchy.
- `knowledge_folders` / `knowledge_items` / `knowledge_item_agents` / `knowledge_chunks` — unified knowledge system. Items have `kind` (page/skill/file/source), `scope` (workspace/agent), embedding pipeline fields. Agent-scoped items use the junction table.
- `entity_links` — universal polymorphic linking. Any owner (task, routine, collection_record, agent) can link to any target (knowledge_item, collection_record, contact, organization, task, url). Extended with `is_deliverable`, `review_status`, `review_note`, `submitted_by_agent_id` for agent-submitted work products on tasks.
- `task_relations` — task-to-task dependency links (`blocked_by`, `blocks`, `relates_to`, `parent_of`, `child_of`). Used for dependency tracking and blocker resolution.
- `labels` / `task_labels` — managed labels with color and description, linked to tasks via junction table.
- `task_templates` — reusable task group templates with dependency graphs, stored as JSONB.
- `routines` — scheduled and event-driven agent behaviors. Has `trigger_type` (schedule/event), cadence fields (sub-daily to monthly), and event fields (entity_type, field, condition, value).
- `collection_definitions` / `collection_fields` / `collection_records` / `collection_views` — user-defined tables with typed JSONB fields and saved views (table/kanban/calendar).
- `source_connections` / `source_sync_runs` — external source integrations via plugin-based connectors (`gateway/connectors/<provider>/`). Each provider has a `manifest.json`, auto-discovered by the registry. `writable` flag enables write-back. `source_write` command action routes writes through the command queue. Source connections reference `secrets` via `secret_id` FK for OAuth token storage.
- `secrets` — encrypted credentials (AES-256-GCM). Scoped per gateway, optionally per agent. Categories: `user` (manual), `channel` (Telegram/Discord/Slack tokens), `integration` (OAuth tokens). Synced to gateway filesystem via Realtime. Values never exposed in API responses or logs.
- `hq_plugins` — plugin registry. One row per installed plugin. Source types: `builtin`, `local`, `webhook`, `marketplace`. Has `hooks` (text array of subscribed events), `config` (operator settings), `config_schema` (JSON Schema), `webhook_url`/`webhook_secret` for remote plugins. Realtime-enabled.
- `hq_plugin_events` — execution log. Every hook dispatch is recorded with status, duration, error message. 30-day retention via pg_cron.
- `hq_plugin_state` — scoped key-value store for plugins. Keyed by `(plugin_id, scope_kind, scope_id, state_key)`.
- `hq_plugin_event_queue` — lightweight append-only queue bridging SQL triggers to the plugin runner daemon. Triggers on tasks, agents, knowledge_items, inbox, comments, secrets write here; plugin_runner polls/subscribes and dispatches. 1-hour retention via pg_cron.
- `agent_commands` / `agent_inbox_items` — command queue and inbox for agent execution.
- `agent_usage` / `agent_budgets` — append-only LLM usage plus per-agent budget rollups.
- `tenants` — multi-tenant support via `tenant_id` on all tables, scoped RLS via `current_tenant_id()`.

Key RPCs: `search_knowledge_items()`, `search_knowledge_chunks()`, `lease_knowledge_items_for_indexing()`, `lease_knowledge_items_for_processing()`, `routine_next_occurrence()`, `spawn_routine_schedule_items()`, `lease_command()`, `get_agent_daily_usage()`, `get_task_relations()`.

Additional task infrastructure: `notify_blocker_resolved` trigger fires when a blocking task completes. `escalate_overdue_tasks` pg_cron job (every minute) marks overdue tasks as `missed` and creates inbox items for assigned agents.

RLS: All tables use tenant-scoped policies via `current_tenant_id()` JWT claim. OSS uses a single default tenant (`00000000-0000-0000-0000-000000000000`). The `service_role` key bypasses RLS.

## Conventions

- **Code references**: use markdown link syntax when pointing the user at real files and specific lines.
- **Supabase migrations**: always include explicit `GRANT` statements for `authenticated` and `service_role`. The project's Supabase setup does not grant these by default. *(Saved as memory — see user preferences.)*
- **New UI modules**: follow the existing pattern — types in `lib/<module>/types.ts`, hooks in `hooks/use-<module>.ts`, components in `components/<module>/`.
- **New daemon actions**: add the case to `command_runner.py`'s `build_command()`, add or migrate the `command_action` enum, and expose it as a server action in `apps/ui/src/app/dashboard/agents/actions.ts`.
- **New source connectors**: copy `gateway/connectors/_template/` to a new folder, fill in `manifest.json` and the connector methods, run `node scripts/build-source-manifests.mjs` to generate UI types. See `CONTRIBUTING-SOURCES.md`.
- **New plugins**: copy `gateway/plugins/_template/` to a new folder, edit `manifest.json` (id, hooks, config_schema, capabilities), implement `handler.py` (subclass `BasePlugin`, implement `on_event()`). For webhook plugins, no gateway code — register via Settings → Plugins. See `gateway/plugins/CONTRIBUTING.md`.
- **Dockerfile edits**: multi-arch build (amd64 + arm64) is the target. Use `TARGETARCH` arg when installing arch-specific binaries (Chrome vs Chromium, Tailscale, Caddy).
- **Colors and theming**: never use hardcoded hex, rgb(), or hsl(). All colors must resolve to CSS variable tokens via Tailwind utilities (`bg-primary`, `text-status-success`, `border-accent-blue/20`, etc.). The theme is user-customizable — workspace admins can change the brand color, surface warmth, and individual token overrides via Settings → Appearance. The derivation engine in `lib/theme/derive.ts` generates all CSS variables from a brand color + warmth; `components/theme-applier.tsx` injects them at runtime. When adding new interactive elements, use `bg-primary`/`text-primary` for the active/brand state. For new semantic roles, add a token to `globals.css` (both `:root` and `.dark`), wire it through `@theme inline`, and update the `ThemeTokens` type + derivation functions in `lib/theme/`.
- **Testing**: run `make test` before committing. UI tests use Vitest + jsdom + React Testing Library; see `TESTING.md` for patterns. New hooks get a test file in `__tests__/hooks/`, new lib modules in `__tests__/lib/`, new components in `__tests__/components/`. Mock Supabase at the boundary via `createMockSupabaseClient`, never mock internal logic. Use factories (`buildTask`, `buildAgent`, etc.) for test data. Coverage thresholds are enforced in CI — run `make test-coverage` if you've added source files.
- **Comments**: default to none. Only add one when the *why* is non-obvious (a hidden constraint, a subtle invariant, a workaround). Don't narrate what the code does.

## Current Roadmap Shape

- Shipped: self-hosted stack, browser onboarding, multi-workspace registry, UI-driven gateway registration, provider connections, noVNC modal, usage budgets, agent hierarchy, unified knowledge (pages/skills/files/sources), entity links, routines (schedule + event), collections (table/kanban/calendar views), file processing pipeline, source connections (Notion) with plugin-based connector architecture (manifest-driven, auto-discovery, generic OAuth, gateway-proxied browse/validate, optional write-back, contributor template + guide), modular onboarding, task calendar view, agent-initiated skill learning (auto-creation with version history), encrypted secrets management (AES-256-GCM, Settings UI + agent Secrets tab, gateway .env sync), task relations/dependencies (blocked_by, blocks, relates_to, parent_of, child_of with blocker resolution notifications), labels (managed colors, task picker, filter), deliverables (agent-submitted work products with review workflow: draft → approved/revision_requested/rejected), task templates (reusable task groups with dependency graphs), overdue escalation (pg_cron auto-miss + inbox notification), agent delegation skill (subtask creation with org-chart validation), HQ plugin system (event-driven hooks, local Python + webhook plugins, plugin runner daemon, SDK with state/secrets/supabase clients, Settings UI for management), and user-customizable theming (brand color + warmth + mode + per-token overrides via Settings → Appearance, OKLCH-based derivation engine, runtime CSS variable injection).
- Shipped: comprehensive automated test suite — Vitest (190 files, ~2,270 tests) for UI hooks/lib/components, pytest (11 files, 208 tests) for gateway daemons, shell tests for lifecycle scripts, DB contract tests for RLS/schema — with CI enforcement (8-job PR gate + main-only coverage/DB gates) and coverage thresholds (40% statements/lines, 35% branches/functions).
- Shipped (hosted): hosted offering live at app.yourhq.ai, Sentry error tracking across all runtimes (UI client/server/edge, worker, Python gateway daemons — hosted-only, never self-hosted), PostHog product analytics (hosted-only)
- Next: Google Drive connector (validates plugin architecture with second provider), public deployment docs, richer pricing coverage, template docs, and docs site generation.
