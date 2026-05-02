-- 023_entity_links.sql — Universal polymorphic linking table.
--
-- Replaces task_attachments with a generalized entity linking system.
-- Any entity (task, routine, collection_record, agent) can link to any
-- other entity (knowledge_item, collection_record, contact, organization,
-- task, or a raw URL).

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

-- Timestamps trigger
DROP TRIGGER IF EXISTS entity_links_updated_at ON entity_links;
CREATE TRIGGER entity_links_updated_at
  BEFORE UPDATE ON entity_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON entity_links
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

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

GRANT ALL ON entity_links TO authenticated;
GRANT ALL ON entity_links TO service_role;

-- ── Migrate task_attachments → entity_links ────────────────────────

INSERT INTO entity_links (tenant_id, owner_type, owner_id, target_type, target_id, url, label)
SELECT
  COALESCE(t.tenant_id, '00000000-0000-0000-0000-000000000000'),
  'task',
  ta.task_id,
  CASE ta.entity_type
    WHEN 'document' THEN 'document'
    WHEN 'asset'    THEN 'asset'
    WHEN 'url'      THEN 'url'
  END,
  ta.entity_id,
  ta.url,
  ta.label
FROM task_attachments ta
JOIN tasks t ON t.id = ta.task_id
ON CONFLICT DO NOTHING;

-- ── Drop task_attachments ──────────────────────────────────────────

DROP TRIGGER IF EXISTS task_attachments_sync_parent ON task_attachments;
DROP FUNCTION IF EXISTS sync_task_attachment_updated();
DROP TRIGGER IF EXISTS task_attachments_updated_at ON task_attachments;
DROP TABLE IF EXISTS task_attachments CASCADE;

-- ── Schema version ─────────────────────────────────────────────────

INSERT INTO _schema_version (version, description)
VALUES (23, 'Entity links: universal polymorphic linking table replacing task_attachments')
ON CONFLICT (version) DO NOTHING;
