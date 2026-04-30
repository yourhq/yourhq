# Schema Reference

## Migrations

All Supabase schema is defined in `db/migrations/`. Files are numbered and must be applied in order. The latest migration sets the `_schema_version` table which the UI reads to show update banners.

## Key tables

| Table | Purpose |
|---|---|
| `tenants` | Tenant registry. Self-hosted deployments have a single default tenant (`00000000-0000-0000-0000-000000000000`). |
| `workspace` | Per-tenant workspace config (name, slug, initialized flag). |
| `gateways` | One row per gateway host. Carries status, heartbeat, and reachable URLs in `meta`. |
| `agents` | Agent definitions. Each agent belongs to one gateway (`gateway_id`) and one tenant. |
| `agent_commands` | Command queue. The UI inserts rows; the gateway's command runner leases and executes them. |
| `agent_inbox_items` | Inbox queue. Triggers and webhooks insert items; the inbox dispatcher wakes agents to process them. |
| `agent_usage` | Append-only LLM usage records written by agents. |
| `agent_budgets` | Budget rollups per agent, recomputed by triggers on `agent_usage`. |
| `contacts` / `companies` / `deals` | CRM module tables. |
| `tasks` / `task_series` | Task management with optional recurring series. |
| `documents` / `assets` | Knowledge base and file storage metadata. |
| `automation_rules` | Event-driven automation rules that fire inbox items. |
| `audit_log` | Append-only audit trail for all user and system actions. |
| `notifications` | User-facing notifications. |
| `tags` | Universal tagging system across modules. |
| `_schema_version` | Tracks applied schema version for migration tooling. |

## Tenant isolation

Every tenant-owned table has a `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` column. RLS policies enforce `tenant_id = current_tenant_id()` for the `authenticated` role, where `current_tenant_id()` extracts the tenant ID from the JWT's `app_metadata`.

The `service_role` bypasses RLS and has unrestricted access (used by daemons and server actions).

## Status enums

**`agent_status`:** `ready`, `error`, `paused`, `provisioning`, `hibernating`

**`gateway_status`:** `ready`, `error`, `paused`, `provisioning`, `hibernating`

| Status | Meaning | Set by |
|---|---|---|
| `ready` | Operational, heartbeat active | Daemon heartbeat |
| `error` | Crashed or unreachable | Stale detection / manual |
| `paused` | User-initiated pause | UI pause button |
| `provisioning` | Being set up | Provisioning flow |
| `hibernating` | System-initiated sleep | Idle detector (hosted) |

## Key RPCs

| Function | Purpose |
|---|---|
| `lease_command(p_lease_seconds, p_gateway_slug)` | Atomically lease the next pending command for a gateway. |
| `consume_gateway_token(p_token_hash, p_slug, ...)` | One-time gateway registration token consumption. |
| `spawn_due_task_instances()` | Create task instances from recurring series that are due. |
| `complete_setup(p_workspace_name, p_slug, ...)` | Setup wizard completion — creates workspace and initial config. |
| `recompute_agent_budget(p_agent_id)` | Recalculate budget rollups for an agent. |

## Migration tooling (`apps/migrate/`)

The `@yourhq/migrate` package provides a CLI for applying schema migrations directly against Postgres (session mode, port 5432).

```bash
# Install
cd apps/migrate && npm install

# List available migrations
npx yourhq-migrate --list

# Dry run (show what would be applied)
npx yourhq-migrate --dry-run --connection-string "postgres://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres"

# Apply pending migrations
npx yourhq-migrate --connection-string "postgres://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres"

# Generate a single SQL bundle (for manual paste into SQL editor)
npx yourhq-migrate --bundle > schema.sql
```

The runner tracks applied migrations in a `_yourhq_migrations` table (version, checksum, applied_at). It verifies checksums on already-applied migrations to detect drift. Each migration runs in a transaction — if one fails, it rolls back and stops.

For Cloud Supabase users who can't access port 5432, the onboarding wizard provides a "Copy SQL → Open SQL Editor" manual flow.

## Adding a new migration

1. Create `db/migrations/NNN_description.sql` with the next number.
2. Include explicit `GRANT` statements for `authenticated` and `service_role`.
3. If adding a tenant-owned table, include `tenant_id` column and RLS policy.
4. Update `_schema_version`: `INSERT INTO _schema_version (version, description) VALUES (NNN, '...');`
5. Update `EXPECTED_SCHEMA_VERSION` in `apps/ui/src/app/dashboard/actions.ts`.
