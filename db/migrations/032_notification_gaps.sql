-- 032_notification_gaps.sql — Fill notification gaps for deliverable submissions and overdue tasks.

-- ── Notify human when agent submits a deliverable for review ──────

CREATE OR REPLACE FUNCTION notify_deliverable_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent_name text;
  v_task_title text;
BEGIN
  IF NEW.is_deliverable = false OR NEW.submitted_by_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire on initial submission (INSERT) — agents create deliverables as 'draft'
  -- and the human reviews directly from that state.
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_agent_name
    FROM public.agents WHERE id = NEW.submitted_by_agent_id;

    IF NEW.owner_type = 'task' THEN
      SELECT title INTO v_task_title
      FROM public.tasks WHERE id = NEW.owner_id;
    END IF;

    INSERT INTO public.notifications (
      tenant_id, type, title, body,
      entity_type, entity_id,
      actor_type, actor_agent_id, meta
    ) VALUES (
      NEW.tenant_id,
      'deliverable_submitted',
      COALESCE(v_agent_name, 'Agent') || ' submitted a deliverable for review',
      COALESCE(NEW.label, 'Untitled'),
      CASE WHEN NEW.owner_type = 'task' THEN 'task' ELSE NEW.owner_type END,
      NEW.owner_id,
      'agent',
      NEW.submitted_by_agent_id,
      jsonb_build_object(
        'deliverable_id', NEW.id,
        'deliverable_label', NEW.label,
        'task_title', v_task_title,
        'agent_name', v_agent_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_links_notify_deliverable_submitted ON entity_links;
CREATE TRIGGER entity_links_notify_deliverable_submitted
  AFTER INSERT ON entity_links
  FOR EACH ROW
  WHEN (NEW.is_deliverable = true AND NEW.submitted_by_agent_id IS NOT NULL)
  EXECUTE FUNCTION notify_deliverable_submitted();

GRANT EXECUTE ON FUNCTION notify_deliverable_submitted() TO authenticated, service_role;

-- ── Notify human when task becomes overdue ────────────────────────
-- The existing escalate_overdue_tasks() only creates agent_inbox_items.
-- This adds a human-visible notification.

CREATE OR REPLACE FUNCTION notify_task_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent_name text;
BEGIN
  IF NEW.status = 'missed' AND OLD.status IS DISTINCT FROM 'missed' THEN
    IF NEW.assignee_agent_id IS NOT NULL THEN
      SELECT name INTO v_agent_name
      FROM public.agents WHERE id = NEW.assignee_agent_id;
    END IF;

    INSERT INTO public.notifications (
      tenant_id, type, title, body,
      entity_type, entity_id,
      actor_type, actor_agent_id, meta
    ) VALUES (
      NEW.tenant_id,
      'task_overdue',
      'Task overdue: ' || COALESCE(NEW.title, 'Untitled'),
      CASE
        WHEN v_agent_name IS NOT NULL
          THEN 'Assigned to ' || v_agent_name || ' — deadline was ' || COALESCE(NEW.due_date::text, NEW.due_at::text, 'unknown')
        ELSE 'Deadline was ' || COALESCE(NEW.due_date::text, NEW.due_at::text, 'unknown')
      END,
      'task',
      NEW.id,
      'system',
      NEW.assignee_agent_id,
      jsonb_build_object(
        'task_title', NEW.title,
        'due_date', NEW.due_date,
        'due_at', NEW.due_at,
        'agent_name', v_agent_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_notify_overdue ON tasks;
CREATE TRIGGER tasks_notify_overdue
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  WHEN (NEW.status = 'missed' AND OLD.status IS DISTINCT FROM 'missed')
  EXECUTE FUNCTION notify_task_overdue();

GRANT EXECUTE ON FUNCTION notify_task_overdue() TO authenticated, service_role;
