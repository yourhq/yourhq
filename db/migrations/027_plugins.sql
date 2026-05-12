-- 027_plugins.sql — HQ-native plugin system.
--
-- Provides event-driven extensibility via local Python plugins and
-- remote webhook plugins. Hooks into business-logic events (tasks,
-- agents, knowledge, routines) rather than the LLM call lifecycle.

-- ── hq_plugins ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hq_plugins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,

  plugin_id       text NOT NULL,
  name            text NOT NULL,
  description     text,
  version         text NOT NULL DEFAULT '0.1.0',
  source          plugin_source NOT NULL DEFAULT 'local',
  is_enabled      boolean NOT NULL DEFAULT true,

  hooks           text[] NOT NULL DEFAULT '{}',

  entry_module    text,
  webhook_url     text,
  webhook_secret  text,

  config          jsonb NOT NULL DEFAULT '{}',
  config_schema   jsonb,

  capabilities    text[] NOT NULL DEFAULT '{}',

  installed_by    uuid,
  meta            jsonb NOT NULL DEFAULT '{}',

  UNIQUE (tenant_id, plugin_id)
);

CREATE INDEX IF NOT EXISTS idx_hq_plugins_tenant ON hq_plugins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hq_plugins_enabled ON hq_plugins(is_enabled) WHERE is_enabled;

DROP TRIGGER IF EXISTS hq_plugins_updated_at ON hq_plugins;
CREATE TRIGGER hq_plugins_updated_at
  BEFORE UPDATE ON hq_plugins FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hq_plugins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON hq_plugins;
CREATE POLICY "Tenant isolation" ON hq_plugins
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON hq_plugins;
CREATE POLICY "Service role full access" ON hq_plugins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON hq_plugins TO authenticated, service_role;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE hq_plugins;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE hq_plugins REPLICA IDENTITY FULL;

-- ── hq_plugin_state ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hq_plugin_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  plugin_id       text NOT NULL,
  scope_kind      text NOT NULL DEFAULT 'global',
  scope_id        text NOT NULL DEFAULT '',
  state_key       text NOT NULL,
  state_value     jsonb,
  UNIQUE (tenant_id, plugin_id, scope_kind, scope_id, state_key)
);

CREATE INDEX IF NOT EXISTS idx_hq_plugin_state_lookup
  ON hq_plugin_state(tenant_id, plugin_id, scope_kind);

DROP TRIGGER IF EXISTS hq_plugin_state_updated_at ON hq_plugin_state;
CREATE TRIGGER hq_plugin_state_updated_at
  BEFORE UPDATE ON hq_plugin_state FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE hq_plugin_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON hq_plugin_state;
CREATE POLICY "Tenant isolation" ON hq_plugin_state
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON hq_plugin_state;
CREATE POLICY "Service role full access" ON hq_plugin_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON hq_plugin_state TO authenticated, service_role;

-- ── hq_plugin_events ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hq_plugin_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  plugin_id       text NOT NULL,
  hook            text NOT NULL,
  entity_type     text,
  entity_id       uuid,
  status          plugin_event_status NOT NULL,
  duration_ms     integer,
  error_message   text,
  request_payload jsonb,
  response_payload jsonb,
  meta            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hq_plugin_events_plugin
  ON hq_plugin_events(plugin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hq_plugin_events_tenant
  ON hq_plugin_events(tenant_id, created_at DESC);

ALTER TABLE hq_plugin_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON hq_plugin_events;
CREATE POLICY "Tenant isolation" ON hq_plugin_events
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON hq_plugin_events;
CREATE POLICY "Service role full access" ON hq_plugin_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON hq_plugin_events TO authenticated, service_role;

-- ── hq_plugin_event_queue ───────────────────────────────────────────
-- Lightweight append-only queue. SQL triggers write here; the plugin
-- runner daemon polls/subscribes and dispatches to matching plugins.

CREATE TABLE IF NOT EXISTS hq_plugin_event_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  entity_type     text,
  entity_id       uuid,
  actor_type      text NOT NULL DEFAULT 'system',
  actor_agent_id  uuid,
  payload         jsonb NOT NULL DEFAULT '{}',
  processed       boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_plugin_event_queue_pending
  ON hq_plugin_event_queue(created_at ASC) WHERE NOT processed;

ALTER TABLE hq_plugin_event_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON hq_plugin_event_queue;
CREATE POLICY "Service role full access" ON hq_plugin_event_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON hq_plugin_event_queue TO service_role;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE hq_plugin_event_queue;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE hq_plugin_event_queue REPLICA IDENTITY FULL;

-- ── Event emission triggers ─────────────────────────────────────────
-- Generic trigger function that writes to the event queue.

CREATE OR REPLACE FUNCTION emit_plugin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_event_type text;
  v_payload jsonb;
  v_entity_id uuid;
  v_tenant_id uuid;
  v_actor_type text := 'system';
  v_actor_agent_id uuid;
BEGIN
  v_event_type := TG_ARGV[0];

  IF TG_OP = 'INSERT' THEN
    v_payload := to_jsonb(NEW);
    v_entity_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_payload := jsonb_build_object(
      'new', to_jsonb(NEW),
      'old', to_jsonb(OLD),
      'changed_fields', (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each(to_jsonb(NEW))
        WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
      )
    );
    v_entity_id := NEW.id;
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_payload := to_jsonb(OLD);
    v_entity_id := OLD.id;
    v_tenant_id := OLD.tenant_id;
  END IF;

  v_payload := v_payload - 'encrypted_value' - 'webhook_secret';

  INSERT INTO public.hq_plugin_event_queue (
    tenant_id, event_type, entity_type, entity_id,
    actor_type, actor_agent_id, payload
  )
  VALUES (
    v_tenant_id, v_event_type, TG_TABLE_NAME, v_entity_id,
    v_actor_type, v_actor_agent_id, v_payload
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Task events
DROP TRIGGER IF EXISTS plugin_event_task_created ON tasks;
CREATE TRIGGER plugin_event_task_created
  AFTER INSERT ON tasks FOR EACH ROW
  EXECUTE FUNCTION emit_plugin_event('task.created');

DROP TRIGGER IF EXISTS plugin_event_task_completed ON tasks;
CREATE TRIGGER plugin_event_task_completed
  AFTER UPDATE OF status ON tasks FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status != 'done')
  EXECUTE FUNCTION emit_plugin_event('task.completed');

DROP TRIGGER IF EXISTS plugin_event_task_assigned ON tasks;
CREATE TRIGGER plugin_event_task_assigned
  AFTER UPDATE OF assignee_agent_id ON tasks FOR EACH ROW
  WHEN (NEW.assignee_agent_id IS DISTINCT FROM OLD.assignee_agent_id)
  EXECUTE FUNCTION emit_plugin_event('task.assigned');

-- Agent events
DROP TRIGGER IF EXISTS plugin_event_agent_status ON agents;
CREATE TRIGGER plugin_event_agent_status
  AFTER UPDATE OF status ON agents FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION emit_plugin_event('agent.status_changed');

-- Knowledge events
DROP TRIGGER IF EXISTS plugin_event_knowledge_created ON knowledge_items;
CREATE TRIGGER plugin_event_knowledge_created
  AFTER INSERT ON knowledge_items FOR EACH ROW
  EXECUTE FUNCTION emit_plugin_event('knowledge.created');

-- Inbox events
DROP TRIGGER IF EXISTS plugin_event_inbox_created ON agent_inbox_items;
CREATE TRIGGER plugin_event_inbox_created
  AFTER INSERT ON agent_inbox_items FOR EACH ROW
  EXECUTE FUNCTION emit_plugin_event('inbox.created');

DROP TRIGGER IF EXISTS plugin_event_inbox_completed ON agent_inbox_items;
CREATE TRIGGER plugin_event_inbox_completed
  AFTER UPDATE OF status ON agent_inbox_items FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status != 'done')
  EXECUTE FUNCTION emit_plugin_event('inbox.completed');

-- Comment events
DROP TRIGGER IF EXISTS plugin_event_comment_created ON comments;
CREATE TRIGGER plugin_event_comment_created
  AFTER INSERT ON comments FOR EACH ROW
  EXECUTE FUNCTION emit_plugin_event('comment.created');

-- Secret events (no values exposed — trigger strips encrypted_value)
DROP TRIGGER IF EXISTS plugin_event_secret_changed ON secrets;
CREATE TRIGGER plugin_event_secret_changed
  AFTER INSERT OR UPDATE OR DELETE ON secrets FOR EACH ROW
  EXECUTE FUNCTION emit_plugin_event('secret.changed');

-- Routine events (via inbox items with routine event types)
DROP TRIGGER IF EXISTS plugin_event_routine_triggered ON agent_inbox_items;
CREATE TRIGGER plugin_event_routine_triggered
  AFTER INSERT ON agent_inbox_items FOR EACH ROW
  WHEN (NEW.event_type IN ('routine_schedule', 'routine_event'))
  EXECUTE FUNCTION emit_plugin_event('routine.triggered');

-- ── Cleanup cron ────────────────────────────────────────────────────
-- Prune processed queue rows older than 1 hour and event log rows
-- older than 30 days to prevent unbounded growth.

DO $$ BEGIN PERFORM cron.unschedule('plugin-event-queue-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'plugin-event-queue-cleanup',
  '*/10 * * * *',
  $$DELETE FROM public.hq_plugin_event_queue WHERE processed AND created_at < now() - interval '1 hour'$$
);

DO $$ BEGIN PERFORM cron.unschedule('plugin-event-log-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'plugin-event-log-cleanup',
  '0 3 * * *',
  $$DELETE FROM public.hq_plugin_events WHERE created_at < now() - interval '30 days'$$
);
