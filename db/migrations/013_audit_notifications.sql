-- 013_audit_notifications.sql — Audit log and notification tables.

-- ── Audit log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  module          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  action          audit_action NOT NULL,
  summary         text,
  meta            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_type, actor_agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON audit_log
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "Service role full access" ON audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON audit_log TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE audit_log;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE audit_log REPLICA IDENTITY FULL;

-- ── Notifications ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  type            text NOT NULL,
  title           text NOT NULL,
  body            text,
  entity_type     text,
  entity_id       uuid,
  actor_type      actor_type DEFAULT 'system',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  meta            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON notifications
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY "Service role full access" ON notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON notifications TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE notifications REPLICA IDENTITY FULL;
