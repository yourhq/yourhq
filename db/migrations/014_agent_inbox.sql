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
  CONSTRAINT uq_inbox_dedup UNIQUE (tenant_id, dedup_key)
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
      ) ON CONFLICT ON CONSTRAINT uq_inbox_dedup DO NOTHING;
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
      ) ON CONFLICT ON CONSTRAINT uq_inbox_dedup DO NOTHING;
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

-- ── Comment mention inbox items (moved from 011) ─────────────────

CREATE OR REPLACE FUNCTION enqueue_comment_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_mention text;
  v_agent_record RECORD;
  v_dedup_key text;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_mention IN ARRAY NEW.mentions LOOP
    v_mention := ltrim(v_mention, '@');
    SELECT id, slug, tenant_id INTO v_agent_record
      FROM public.agents WHERE slug = v_mention AND tenant_id = NEW.tenant_id;
    IF v_agent_record.id IS NULL THEN CONTINUE; END IF;
    IF NEW.actor_agent_id = v_agent_record.id THEN CONTINUE; END IF;

    v_dedup_key := 'comment_mention:' || NEW.id || ':' || v_agent_record.id;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type, task_id, comment_id, summary, dedup_key, context, tenant_id
    ) VALUES (
      v_agent_record.id, v_agent_record.slug, 'task_comment_mention',
      CASE WHEN NEW.entity_type = 'task' THEN NEW.entity_id ELSE NULL END,
      NEW.id,
      '@' || v_agent_record.slug || ' mentioned in comment', v_dedup_key,
      jsonb_build_object(
        'comment_body', left(NEW.body, 500),
        'entity_type', NEW.entity_type, 'entity_id', NEW.entity_id,
        'actor_type', NEW.actor_type, 'actor_agent_id', NEW.actor_agent_id
      ),
      v_agent_record.tenant_id
    ) ON CONFLICT ON CONSTRAINT uq_inbox_dedup DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_enqueue_mentions ON comments;
CREATE TRIGGER comments_enqueue_mentions
  AFTER INSERT ON comments
  FOR EACH ROW
  WHEN (NEW.mentions IS NOT NULL AND array_length(NEW.mentions, 1) IS NOT NULL)
  EXECUTE FUNCTION enqueue_comment_mentions();

GRANT EXECUTE ON FUNCTION enqueue_comment_mentions() TO authenticated, service_role;

-- ── Agent comment notifications (moved from 011) ─────────────────

CREATE OR REPLACE FUNCTION notify_agent_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent_name text;
  v_title text;
BEGIN
  IF NEW.actor_type != 'agent' THEN RETURN NEW; END IF;

  SELECT name INTO v_agent_name FROM public.agents WHERE id = NEW.actor_agent_id AND tenant_id = NEW.tenant_id;

  IF NEW.entity_type = 'task' THEN
    SELECT title INTO v_title FROM public.tasks WHERE id = NEW.entity_id AND tenant_id = NEW.tenant_id;
  END IF;

  INSERT INTO public.notifications (tenant_id, type, title, body, entity_type, entity_id, actor_type, actor_agent_id, meta)
  VALUES (
    NEW.tenant_id, 'agent_comment',
    COALESCE(v_agent_name, 'Agent') || ' commented',
    left(NEW.body, 200),
    NEW.entity_type, NEW.entity_id, 'agent', NEW.actor_agent_id,
    jsonb_build_object('comment_id', NEW.id, 'entity_title', v_title)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_notify_agent ON comments;
CREATE TRIGGER comments_notify_agent
  AFTER INSERT ON comments
  FOR EACH ROW
  WHEN (NEW.actor_type = 'agent')
  EXECUTE FUNCTION notify_agent_comment();

GRANT EXECUTE ON FUNCTION notify_agent_comment() TO authenticated, service_role;
