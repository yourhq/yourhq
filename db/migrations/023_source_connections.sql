-- 023_source_connections.sql — External source connections (Notion, Google Drive).
--
-- source_connections: OAuth/API-key credentials for external services.
-- source_sync_runs: audit trail of sync operations.
-- FK on knowledge_items.source_connection_id.

-- ── source_connections ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  tenant_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                        REFERENCES tenants(id) ON DELETE CASCADE,
  provider            text NOT NULL CHECK (provider IN ('notion', 'google_drive')),
  account_label       text NOT NULL,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  last_verified_at    timestamptz,
  sync_interval_hours integer NOT NULL DEFAULT 6 CHECK (sync_interval_hours >= 1),
  next_sync_at        timestamptz,
  error_message       text,
  meta                jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_source_connections_tenant ON source_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_source_connections_next_sync
  ON source_connections (tenant_id, next_sync_at ASC)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS source_connections_updated_at ON source_connections;
CREATE TRIGGER source_connections_updated_at
  BEFORE UPDATE ON source_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── source_sync_runs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS source_sync_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES source_connections(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'done', 'failed')),
  items_synced    integer DEFAULT 0,
  items_failed    integer DEFAULT 0,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  error_message   text
);

CREATE INDEX IF NOT EXISTS idx_source_sync_runs_connection ON source_sync_runs(connection_id);

-- ── FK on knowledge_items ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'knowledge_items_source_connection_fk'
      AND table_name = 'knowledge_items'
  ) THEN
    ALTER TABLE knowledge_items
      ADD CONSTRAINT knowledge_items_source_connection_fk
      FOREIGN KEY (source_connection_id) REFERENCES source_connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── RLS ───────────────────────────────────────────────────────────

ALTER TABLE source_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access" ON source_connections;
DROP POLICY IF EXISTS "Tenant isolation" ON source_connections;
CREATE POLICY "Tenant isolation" ON source_connections
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON source_connections;
CREATE POLICY "Service role full access" ON source_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated full access" ON source_sync_runs;
DROP POLICY IF EXISTS "Tenant isolation" ON source_sync_runs;
CREATE POLICY "Tenant isolation" ON source_sync_runs
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON source_sync_runs;
CREATE POLICY "Service role full access" ON source_sync_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ──────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE source_connections;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE source_sync_runs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Grants ────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON source_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON source_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON source_sync_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON source_sync_runs TO service_role;

-- ── Schema version ────────────────────────────────────────────────

INSERT INTO _schema_version (version) VALUES (23)
ON CONFLICT (version) DO NOTHING;
