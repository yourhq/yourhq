-- 026_secrets.sql — Unified secrets management.
--
-- Encrypted credential storage for agent tools/skills. Replaces the
-- token-in-payload pattern for channel tokens and provides a general-
-- purpose secrets vault accessible from the UI.

-- ── secrets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS secrets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  gateway_id      uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  agent_id        uuid REFERENCES agents(id) ON DELETE CASCADE,
  key             text NOT NULL,
  name            text NOT NULL,
  encrypted_value text NOT NULL,
  category        text NOT NULL DEFAULT 'user'
                    CHECK (category IN ('user', 'channel', 'integration')),
  note            text,
  sync_status     text NOT NULL DEFAULT 'pending'
                    CHECK (sync_status IN ('pending', 'active', 'error', 'waiting')),
  last_synced_at  timestamptz
);

-- Scope uniqueness: one key per scope (gateway-level vs agent-level handled separately
-- because PostgreSQL UNIQUE treats NULLs as distinct).
CREATE UNIQUE INDEX IF NOT EXISTS idx_secrets_gateway_key
  ON secrets(tenant_id, gateway_id, key) WHERE agent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_secrets_agent_key
  ON secrets(tenant_id, gateway_id, agent_id, key) WHERE agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_secrets_gateway ON secrets(gateway_id);
CREATE INDEX IF NOT EXISTS idx_secrets_agent ON secrets(agent_id) WHERE agent_id IS NOT NULL;

DROP TRIGGER IF EXISTS secrets_updated_at ON secrets;
CREATE TRIGGER secrets_updated_at
  BEFORE UPDATE ON secrets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON secrets;
CREATE POLICY "Tenant isolation" ON secrets
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "Service role full access" ON secrets;
CREATE POLICY "Service role full access" ON secrets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Realtime ─────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE secrets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE secrets REPLICA IDENTITY FULL;

-- ── Grants ───────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON secrets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON secrets TO service_role;

-- ── Source connections FK ────────────────────────────────────────────
-- Allows source_connections to reference their credential in the secrets table.

ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS secret_id uuid REFERENCES secrets(id) ON DELETE SET NULL;
