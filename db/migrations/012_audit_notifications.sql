-- 012_audit_notifications.sql — Audit log and notification tables.

CREATE TABLE IF NOT EXISTS audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  module          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  action          audit_action NOT NULL,
  summary         text,
  changes         jsonb,
  meta            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_type, actor_agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Column reconciliation for audit_log
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

-- ── Notifications ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  type            text NOT NULL,
  title           text NOT NULL,
  body            text,
  entity_type     text,
  entity_id       uuid,
  actor_type      actor_type DEFAULT 'system',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  is_read         boolean DEFAULT false,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  meta            jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_type actor_type DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_agent_id uuid;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
