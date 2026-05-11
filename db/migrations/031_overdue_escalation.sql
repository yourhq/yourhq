-- 031_overdue_escalation.sql — Auto-escalate tasks that miss their deadline.

CREATE OR REPLACE FUNCTION escalate_overdue_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_task RECORD;
  v_manager RECORD;
  v_dedup_key text;
BEGIN
  FOR v_task IN
    SELECT t.id, t.title, t.status, t.due_date, t.due_at,
           t.assignee_agent_id, a.slug AS agent_slug, a.name AS agent_name,
           a.reports_to_id, a.tenant_id
    FROM public.tasks t
    LEFT JOIN public.agents a ON a.id = t.assignee_agent_id
    WHERE t.archived_at IS NULL
      AND t.status NOT IN ('done', 'cancelled', 'missed')
      AND (
        (t.due_at IS NOT NULL AND t.due_at < now())
        OR (t.due_date IS NOT NULL AND t.due_at IS NULL AND t.due_date < CURRENT_DATE)
      )
  LOOP
    UPDATE public.tasks SET status = 'missed' WHERE id = v_task.id;

    IF v_task.assignee_agent_id IS NOT NULL THEN
      v_dedup_key := 'overdue:' || v_task.id || ':' || CURRENT_DATE;

      INSERT INTO public.agent_inbox_items (
        agent_id, agent_slug, event_type, task_id,
        summary, dedup_key, context, tenant_id
      ) VALUES (
        v_task.assignee_agent_id,
        v_task.agent_slug,
        'task_assignment',
        v_task.id,
        'OVERDUE: Task missed deadline — ' || v_task.title,
        v_dedup_key,
        jsonb_build_object(
          'task_title', v_task.title,
          'due_date', v_task.due_date,
          'escalation', true
        ),
        v_task.tenant_id
      ) ON CONFLICT (dedup_key) DO NOTHING;

      IF v_task.reports_to_id IS NOT NULL THEN
        SELECT id, slug, name INTO v_manager
        FROM public.agents WHERE id = v_task.reports_to_id;

        IF v_manager.id IS NOT NULL THEN
          v_dedup_key := 'overdue_escalation:' || v_task.id || ':' || v_manager.id || ':' || CURRENT_DATE;

          INSERT INTO public.agent_inbox_items (
            agent_id, agent_slug, event_type, task_id,
            summary, dedup_key, context, tenant_id
          ) VALUES (
            v_manager.id,
            v_manager.slug,
            'task_assignment',
            v_task.id,
            'ESCALATION: ' || COALESCE(v_task.agent_name, 'Agent') || ' missed deadline on — ' || v_task.title,
            v_dedup_key,
            jsonb_build_object(
              'task_title', v_task.title,
              'due_date', v_task.due_date,
              'overdue_agent_id', v_task.assignee_agent_id,
              'overdue_agent_name', v_task.agent_name,
              'escalation', true
            ),
            v_task.tenant_id
          ) ON CONFLICT (dedup_key) DO NOTHING;
        END IF;
      END IF;

      INSERT INTO public.audit_log (
        tenant_id, actor_type, module, entity_type, entity_id,
        action, summary
      ) VALUES (
        v_task.tenant_id, 'system', 'tasks', 'task', v_task.id,
        'status_changed',
        'Task auto-escalated: missed deadline'
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION escalate_overdue_tasks() TO service_role;

SELECT cron.schedule(
  'escalate-overdue-tasks',
  '* * * * *',
  $$SELECT escalate_overdue_tasks()$$
);
