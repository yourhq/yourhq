-- 027_source_plugin_support.sql — Extensible provider and write support for sources.

-- ── Remove hardcoded provider constraint ────────────────────────────
-- The valid provider list is now determined by installed connectors,
-- not the schema. Application-layer validation (registry lookup) replaces
-- the DB constraint.

ALTER TABLE source_connections DROP CONSTRAINT IF EXISTS source_connections_provider_check;

-- ── Write access toggle ─────────────────────────────────────────────

ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS writable boolean NOT NULL DEFAULT false;

-- ── source_write command action ─────────────────────────────────────
-- Lets agents trigger provider-specific write operations through the
-- existing command queue.

DO $$ BEGIN
  ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'source_write';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
