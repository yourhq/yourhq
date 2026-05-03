-- 019_entity_links.sql — Universal polymorphic linking table.

-- ── entity_links table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  tenant_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                  REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type    text NOT NULL,
  owner_id      uuid NOT NULL,
  target_type   text NOT NULL,
  target_id     uuid,
  url           text,
  label         text,
  sort_order    integer DEFAULT 0,
  meta          jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT entity_links_target_check CHECK (
    (target_type = 'url' AND url IS NOT NULL AND target_id IS NULL) OR
    (target_type != 'url' AND target_id IS NOT NULL AND url IS NULL)
  ),
  CONSTRAINT entity_links_unique UNIQUE (owner_type, owner_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_links_owner
  ON entity_links(owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_entity_links_target
  ON entity_links(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_entity_links_tenant
  ON entity_links(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS entity_links_url_unique
  ON entity_links(owner_type, owner_id, url) WHERE target_type = 'url';

DROP TRIGGER IF EXISTS entity_links_updated_at ON entity_links;
CREATE TRIGGER entity_links_updated_at
  BEFORE UPDATE ON entity_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON entity_links
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "Service role full access" ON entity_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Realtime ───────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE entity_links;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE entity_links REPLICA IDENTITY FULL;

-- ── Grants ─────────────────────────────────────────────────────────

GRANT ALL ON entity_links TO authenticated, service_role;
