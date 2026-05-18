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
  changes         jsonb,
  meta            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_type, actor_agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_time
  ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);

-- RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON audit_log;
CREATE POLICY "Tenant isolation" ON audit_log
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON audit_log;
CREATE POLICY "Service role full access" ON audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT ON audit_log TO authenticated, service_role;

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
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (tenant_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON notifications;
CREATE POLICY "Tenant isolation" ON notifications
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON notifications;
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

-- ── Task status → notification trigger ────────────────────────────

CREATE OR REPLACE FUNCTION notify_task_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_type text;
  v_title text;
  v_agent_name text;
BEGIN
  -- Assignment notification (agent assigned)
  IF OLD.assignee_agent_id IS DISTINCT FROM NEW.assignee_agent_id AND NEW.assignee_agent_id IS NOT NULL THEN
    SELECT name INTO v_agent_name FROM public.agents WHERE id = NEW.assignee_agent_id;
    INSERT INTO public.notifications (tenant_id, type, title, body, entity_type, entity_id, actor_type, actor_agent_id, meta)
    VALUES (
      NEW.tenant_id, 'task_assigned',
      COALESCE(v_agent_name, 'Agent') || ' assigned to task',
      COALESCE(NEW.title, 'Untitled'),
      'task', NEW.id, 'system', NEW.assignee_agent_id,
      jsonb_build_object('task_title', NEW.title, 'agent_name', v_agent_name)
    );
  END IF;

  -- Status change notifications
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'done' AND NEW.assignee_agent_id IS NOT NULL THEN
      SELECT name INTO v_agent_name FROM public.agents WHERE id = NEW.assignee_agent_id;
      INSERT INTO public.notifications (tenant_id, type, title, body, entity_type, entity_id, actor_type, actor_agent_id, meta)
      VALUES (
        NEW.tenant_id, 'task_completed',
        COALESCE(v_agent_name, 'Agent') || ' completed a task',
        COALESCE(NEW.title, 'Untitled'),
        'task', NEW.id, 'agent', NEW.assignee_agent_id,
        jsonb_build_object('task_title', NEW.title, 'old_status', OLD.status, 'new_status', NEW.status)
      );
    ELSIF NEW.status = 'blocked' AND NEW.assignee_agent_id IS NOT NULL THEN
      SELECT name INTO v_agent_name FROM public.agents WHERE id = NEW.assignee_agent_id;
      INSERT INTO public.notifications (tenant_id, type, title, body, entity_type, entity_id, actor_type, actor_agent_id, meta)
      VALUES (
        NEW.tenant_id, 'task_blocked',
        COALESCE(v_agent_name, 'Agent') || ' is blocked',
        COALESCE(NEW.title, 'Untitled'),
        'task', NEW.id, 'agent', NEW.assignee_agent_id,
        jsonb_build_object('task_title', NEW.title, 'old_status', OLD.status, 'new_status', NEW.status)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_notify_status_change ON tasks;
CREATE TRIGGER tasks_notify_status_change
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.assignee_agent_id IS DISTINCT FROM NEW.assignee_agent_id)
  EXECUTE FUNCTION notify_task_status_change();

GRANT EXECUTE ON FUNCTION notify_task_status_change() TO authenticated, service_role;
