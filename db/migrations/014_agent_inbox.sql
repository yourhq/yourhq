-- 014_agent_inbox.sql — Agent inbox queue, lease RPCs, and triggers.

CREATE TABLE IF NOT EXISTS agent_inbox_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  tenant_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id              uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_slug            text NOT NULL,
  event_type            inbox_event_type NOT NULL,
  task_id               uuid REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id            uuid REFERENCES comments(id) ON DELETE CASCADE,
  contact_id            uuid REFERENCES contacts(id) ON DELETE CASCADE,
  status                inbox_item_status NOT NULL DEFAULT 'pending',
  leased_at             timestamptz,
  leased_until          timestamptz,
  completed_at          timestamptz,
  failed_at             timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 3,
  summary               text,
  context               jsonb NOT NULL DEFAULT '{}',
  last_wake_attempt_at  timestamptz,
  last_wake_success_at  timestamptz,
  dedup_key             text NOT NULL,
  CONSTRAINT uq_inbox_dedup UNIQUE (dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_inbox_tenant ON agent_inbox_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbox_agent_status ON agent_inbox_items(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_agent_pending ON agent_inbox_items(agent_id, status, created_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_inbox_status ON agent_inbox_items(status);
CREATE INDEX IF NOT EXISTS idx_inbox_leased ON agent_inbox_items(leased_until) WHERE status = 'leased';
CREATE INDEX IF NOT EXISTS idx_inbox_task ON agent_inbox_items(task_id);
CREATE INDEX IF NOT EXISTS idx_inbox_contact ON agent_inbox_items(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_created ON agent_inbox_items(created_at DESC);

DROP TRIGGER IF EXISTS inbox_items_updated_at ON agent_inbox_items;
CREATE TRIGGER inbox_items_updated_at
  BEFORE UPDATE ON agent_inbox_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE agent_inbox_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON agent_inbox_items;
CREATE POLICY "Tenant isolation" ON agent_inbox_items
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON agent_inbox_items;
CREATE POLICY "Service role full access" ON agent_inbox_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON agent_inbox_items TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agent_inbox_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE agent_inbox_items REPLICA IDENTITY FULL;

-- ── Lease RPCs ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION lease_inbox_item(
  p_agent_id uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF agent_inbox_items
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.agent_inbox_items
  SET
    status = 'leased',
    leased_at = now(),
    leased_until = now() + (p_lease_seconds || ' seconds')::interval,
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = (
    SELECT id FROM public.agent_inbox_items
    WHERE agent_id = p_agent_id
      AND attempt_count < max_attempts
      AND (
        status = 'pending'
        OR (status = 'leased' AND leased_until < now())
        OR status = 'failed'
      )
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION complete_inbox_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_inbox_items
  SET status = 'done', completed_at = now(), updated_at = now()
  WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION fail_inbox_item(p_item_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item public.agent_inbox_items;
BEGIN
  SELECT * INTO v_item FROM public.agent_inbox_items WHERE id = p_item_id;
  IF v_item.attempt_count >= v_item.max_attempts THEN
    UPDATE public.agent_inbox_items
    SET status = 'dead_letter', failed_at = now(), updated_at = now(),
        context = context || jsonb_build_object('last_failure_reason', p_reason)
    WHERE id = p_item_id;
  ELSE
    UPDATE public.agent_inbox_items
    SET status = 'failed', failed_at = now(), updated_at = now(),
        context = context || jsonb_build_object('last_failure_reason', p_reason)
    WHERE id = p_item_id;
  END IF;
END;
$$;

-- ── Inbox triggers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enqueue_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent RECORD;
  v_dedup_key text;
BEGIN
  IF NEW.assignee_agent_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, slug, tenant_id INTO v_agent FROM public.agents WHERE id = NEW.assignee_agent_id;
  IF v_agent.id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' OR OLD.assignee_agent_id IS NULL OR OLD.assignee_agent_id != NEW.assignee_agent_id THEN
    IF OLD IS NOT NULL AND OLD.assignee_agent_id IS NOT NULL AND OLD.assignee_agent_id != NEW.assignee_agent_id THEN
      v_dedup_key := 'task_reassignment:' || NEW.id || ':' || NEW.assignee_agent_id;
      INSERT INTO public.agent_inbox_items (agent_id, agent_slug, event_type, task_id, summary, dedup_key, context, tenant_id)
      VALUES (
        NEW.assignee_agent_id, v_agent.slug, 'task_reassignment', NEW.id,
        'Task reassigned: ' || COALESCE(NEW.title, 'Untitled'), v_dedup_key,
        jsonb_build_object(
          'task_title', NEW.title, 'task_status', NEW.status,
          'task_priority', NEW.priority, 'previous_agent_id', OLD.assignee_agent_id,
          'model_override', NEW.model_override, 'thinking_override', NEW.thinking_override
        ),
        v_agent.tenant_id
      ) ON CONFLICT (dedup_key) DO NOTHING;
    ELSE
      v_dedup_key := 'task_assignment:' || NEW.id || ':' || NEW.assignee_agent_id;
      INSERT INTO public.agent_inbox_items (agent_id, agent_slug, event_type, task_id, summary, dedup_key, context, tenant_id)
      VALUES (
        NEW.assignee_agent_id, v_agent.slug, 'task_assignment', NEW.id,
        'Task assigned: ' || COALESCE(NEW.title, 'Untitled'), v_dedup_key,
        jsonb_build_object(
          'task_title', NEW.title, 'task_status', NEW.status,
          'task_priority', NEW.priority,
          'model_override', NEW.model_override, 'thinking_override', NEW.thinking_override
        ),
        v_agent.tenant_id
      ) ON CONFLICT (dedup_key) DO NOTHING;
    END IF;

    -- Auto-transition: assigned to agent → in_progress
    IF NEW.status = 'todo' THEN
      UPDATE public.tasks SET status = 'in_progress' WHERE id = NEW.id AND status = 'todo';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enqueue_assignment ON tasks;
CREATE TRIGGER tasks_enqueue_assignment
  AFTER INSERT OR UPDATE OF assignee_agent_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_task_assignment();


-- ── Grants for RPCs ──────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION lease_inbox_item(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION complete_inbox_item(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fail_inbox_item(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION enqueue_task_assignment() TO authenticated, service_role;
