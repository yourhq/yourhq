-- 029_labels.sql — Managed labels for tasks.

CREATE TABLE IF NOT EXISTS labels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#6b7280',
  description text,
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_labels_tenant ON labels(tenant_id);

DROP TRIGGER IF EXISTS labels_updated_at ON labels;
CREATE TRIGGER labels_updated_at
  BEFORE UPDATE ON labels FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON labels;
CREATE POLICY "Tenant isolation" ON labels
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "Service role full access" ON labels;
CREATE POLICY "Service role full access" ON labels
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE labels;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE labels REPLICA IDENTITY FULL;

-- ── Grants ─────────────────────────────────────────────────────────

GRANT ALL ON labels TO authenticated, service_role;

-- ── task_labels junction ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_labels (
  task_id   uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id  uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
              REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_task_labels_task ON task_labels(task_id);
CREATE INDEX IF NOT EXISTS idx_task_labels_label ON task_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_task_labels_tenant ON task_labels(tenant_id);

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE task_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON task_labels;
CREATE POLICY "Tenant isolation" ON task_labels
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "Service role full access" ON task_labels;
CREATE POLICY "Service role full access" ON task_labels
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Grants ─────────────────────────────────────────────────────────

GRANT ALL ON task_labels TO authenticated, service_role;
