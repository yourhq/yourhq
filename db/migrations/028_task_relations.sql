-- 028_task_relations.sql — Task dependencies and relations.

CREATE TABLE IF NOT EXISTS task_relations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  source_task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  target_task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  relation_type   task_relation_type NOT NULL,
  created_by_type actor_type NOT NULL DEFAULT 'human',
  created_by_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  CONSTRAINT no_self_relation CHECK (source_task_id != target_task_id),
  UNIQUE (tenant_id, source_task_id, target_task_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_task_relations_source ON task_relations(source_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_target ON task_relations(target_task_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_tenant ON task_relations(tenant_id);

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE task_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON task_relations;
CREATE POLICY "Tenant isolation" ON task_relations
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "Service role full access" ON task_relations;
CREATE POLICY "Service role full access" ON task_relations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_relations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE task_relations REPLICA IDENTITY FULL;

-- ── Grants ─────────────────────────────────────────────────────────

GRANT ALL ON task_relations TO authenticated, service_role;

-- ── RPC: get all relations for a task (both directions) ───────────

CREATE OR REPLACE FUNCTION get_task_relations(p_task_id uuid)
RETURNS TABLE (
  relation_id     uuid,
  relation_type   task_relation_type,
  direction       text,
  related_task_id uuid,
  related_title   text,
  related_status  task_status,
  related_assignee_name text,
  created_at      timestamptz
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT
    tr.id,
    tr.relation_type,
    'outgoing' AS direction,
    tr.target_task_id,
    t.title,
    t.status,
    a.name,
    tr.created_at
  FROM public.task_relations tr
  JOIN public.tasks t ON t.id = tr.target_task_id
  LEFT JOIN public.agents a ON a.id = t.assignee_agent_id
  WHERE tr.source_task_id = p_task_id

  UNION ALL

  SELECT
    tr.id,
    tr.relation_type,
    'incoming' AS direction,
    tr.source_task_id,
    t.title,
    t.status,
    a.name,
    tr.created_at
  FROM public.task_relations tr
  JOIN public.tasks t ON t.id = tr.source_task_id
  LEFT JOIN public.agents a ON a.id = t.assignee_agent_id
  WHERE tr.target_task_id = p_task_id;
$$;

GRANT EXECUTE ON FUNCTION get_task_relations(uuid) TO authenticated, service_role;

-- ── Trigger: notify when a blocker is resolved ────────────────────

CREATE OR REPLACE FUNCTION notify_blocker_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rel RECORD;
  v_blocked_agent RECORD;
  v_remaining int;
  v_dedup_key text;
  v_verb text;
BEGIN
  IF NEW.status NOT IN ('done', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('done', 'cancelled') THEN
    RETURN NEW;
  END IF;

  v_verb := CASE WHEN NEW.status = 'done' THEN 'done' ELSE 'cancelled' END;

  FOR v_rel IN
    SELECT tr.source_task_id AS blocked_task_id, bt.title AS blocked_title,
           bt.assignee_agent_id, bt.tenant_id
    FROM public.task_relations tr
    JOIN public.tasks bt ON bt.id = tr.source_task_id
    WHERE tr.target_task_id = NEW.id
      AND tr.relation_type = 'blocked_by'
      AND bt.status NOT IN ('done', 'cancelled', 'missed')
      AND bt.archived_at IS NULL
  LOOP
    SELECT count(*) INTO v_remaining
    FROM public.task_relations tr2
    JOIN public.tasks blocker ON blocker.id = tr2.target_task_id
    WHERE tr2.source_task_id = v_rel.blocked_task_id
      AND tr2.relation_type = 'blocked_by'
      AND tr2.target_task_id != NEW.id
      AND blocker.status NOT IN ('done', 'cancelled');

    IF v_remaining = 0 AND v_rel.assignee_agent_id IS NOT NULL THEN
      SELECT id, slug INTO v_blocked_agent
      FROM public.agents WHERE id = v_rel.assignee_agent_id;

      IF v_blocked_agent.id IS NOT NULL THEN
        v_dedup_key := 'blocker_resolved:' || v_rel.blocked_task_id || ':' || NEW.id;

        INSERT INTO public.agent_inbox_items (
          agent_id, agent_slug, event_type, task_id,
          summary, dedup_key, context, tenant_id
        ) VALUES (
          v_blocked_agent.id,
          v_blocked_agent.slug,
          'blocker_resolved',
          v_rel.blocked_task_id,
          'Blocker resolved: "' || NEW.title || '" is ' || v_verb || '. You can proceed with: "' || v_rel.blocked_title || '"',
          v_dedup_key,
          jsonb_build_object(
            'resolved_task_id', NEW.id,
            'resolved_task_title', NEW.title,
            'blocked_task_title', v_rel.blocked_title,
            'remaining_blockers', 0,
            'resolution', v_verb
          ),
          v_rel.tenant_id
        ) ON CONFLICT (dedup_key) DO NOTHING;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_notify_blocker_resolved ON tasks;
CREATE TRIGGER tasks_notify_blocker_resolved
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_blocker_resolved();
