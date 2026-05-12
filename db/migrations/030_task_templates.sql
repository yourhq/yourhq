-- 030_task_templates.sql — Reusable task group templates.

CREATE TABLE IF NOT EXISTS task_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  icon        text,
  color       text,
  items       jsonb NOT NULL DEFAULT '[]',
  meta        jsonb NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_task_templates_tenant ON task_templates(tenant_id);

DROP TRIGGER IF EXISTS task_templates_updated_at ON task_templates;
CREATE TRIGGER task_templates_updated_at
  BEFORE UPDATE ON task_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON task_templates;
CREATE POLICY "Tenant isolation" ON task_templates
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "Service role full access" ON task_templates;
CREATE POLICY "Service role full access" ON task_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_templates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE task_templates REPLICA IDENTITY FULL;

-- ── Grants ─────────────────────────────────────────────────────────

GRANT ALL ON task_templates TO authenticated, service_role;
