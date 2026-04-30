-- 021_status_enums_schema_version.sql — Status enum consolidation + schema version table.
--
-- agent_status: online→ready, offline→error, add provisioning+hibernating
-- gateway_status: new proper enum (was text), same values
-- _schema_version: tracks applied schema version for migration tooling

-- ── Recreate agent_status enum ─────────────────────────────────────
-- Postgres can't use newly added enum values in the same transaction,
-- so we convert to text first, migrate data, then create the new enum.

ALTER TABLE agents ALTER COLUMN status DROP DEFAULT;
ALTER TABLE agents ALTER COLUMN status TYPE text USING status::text;
UPDATE agents SET status = 'ready' WHERE status = 'online';
UPDATE agents SET status = 'error' WHERE status = 'offline';
DROP TYPE IF EXISTS agent_status;
CREATE TYPE agent_status AS ENUM ('ready', 'error', 'paused', 'provisioning', 'hibernating');
ALTER TABLE agents ALTER COLUMN status TYPE agent_status USING status::agent_status;
ALTER TABLE agents ALTER COLUMN status SET DEFAULT 'ready';

-- ── Create gateway_status enum ─────────────────────────────────────
-- gateways.status was text, now becomes a proper enum with the same
-- values as agent_status.

DO $$ BEGIN
  CREATE TYPE gateway_status AS ENUM ('ready', 'error', 'paused', 'provisioning', 'hibernating');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migrate existing gateway status text values
UPDATE gateways SET status = 'ready' WHERE status = 'online';
UPDATE gateways SET status = 'error' WHERE status = 'offline';

ALTER TABLE gateways ALTER COLUMN status DROP DEFAULT;
ALTER TABLE gateways ALTER COLUMN status TYPE gateway_status USING status::gateway_status;
ALTER TABLE gateways ALTER COLUMN status SET DEFAULT 'ready';

-- ── Add last_heartbeat_at to gateways and agents ───────────────────

ALTER TABLE gateways ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;

-- Backfill from last_seen_at
UPDATE gateways SET last_heartbeat_at = last_seen_at WHERE last_heartbeat_at IS NULL AND last_seen_at IS NOT NULL;
UPDATE agents SET last_heartbeat_at = last_seen_at WHERE last_heartbeat_at IS NULL AND last_seen_at IS NOT NULL;

-- ── Add heartbeat to inbox_event_type enum ─────────────────────────

ALTER TYPE inbox_event_type ADD VALUE IF NOT EXISTS 'heartbeat';

-- ── Schema version table ───────────────────────────────────────────
-- Used by migration tooling to verify source/target compatibility.

CREATE TABLE IF NOT EXISTS _schema_version (
  version     integer PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  description text
);

INSERT INTO _schema_version (version, description)
VALUES (21, 'A1 schema unification: tenants, tenant_id, RLS, status enums')
ON CONFLICT (version) DO NOTHING;

-- Grant access (not tenant-scoped — this is a system table)
GRANT SELECT ON _schema_version TO authenticated, service_role;
