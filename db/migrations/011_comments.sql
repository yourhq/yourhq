-- 011_comments.sql — Polymorphic comments.

CREATE TABLE IF NOT EXISTS comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  parent_id       uuid REFERENCES comments(id) ON DELETE CASCADE,
  body            text NOT NULL,
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  mentions        text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_comments_tenant ON comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(tenant_id, entity_type, entity_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_actor ON comments(actor_type, actor_agent_id);

DROP TRIGGER IF EXISTS comments_updated_at ON comments;
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON comments;
CREATE POLICY "Tenant isolation" ON comments
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "Service role full access" ON comments;
CREATE POLICY "Service role full access" ON comments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON comments TO authenticated, service_role;

-- ── Realtime ──────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE comments REPLICA IDENTITY FULL;
