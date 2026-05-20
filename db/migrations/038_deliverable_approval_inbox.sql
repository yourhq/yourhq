-- Auto-complete tasks when all deliverables are approved.
-- Revision/rejection still notifies the agent via inbox.

CREATE OR REPLACE FUNCTION notify_deliverable_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent RECORD;
  v_dedup_key text;
  v_pending_count integer;
BEGIN
  IF NEW.is_deliverable = false OR NEW.submitted_by_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.review_status IS NOT DISTINCT FROM NEW.review_status THEN
    RETURN NEW;
  END IF;

  -- On approval: check if all deliverables on the task are now approved
  -- and auto-complete the task if so.
  IF NEW.review_status = 'approved' AND NEW.owner_type = 'task' THEN
    SELECT count(*) INTO v_pending_count
    FROM public.entity_links
    WHERE owner_type = 'task'
      AND owner_id = NEW.owner_id
      AND is_deliverable = true
      AND (review_status IS NULL OR review_status != 'approved');

    IF v_pending_count = 0 THEN
      UPDATE public.tasks
      SET status = 'done',
          completed_at = now(),
          updated_at = now()
      WHERE id = NEW.owner_id
        AND status != 'done';
    END IF;

    RETURN NEW;
  END IF;

  -- On revision_requested or rejected: notify the agent via inbox
  IF NEW.review_status IN ('revision_requested', 'rejected') THEN
    SELECT id, slug, tenant_id INTO v_agent
    FROM public.agents WHERE id = NEW.submitted_by_agent_id;

    IF v_agent.id IS NOT NULL THEN
      v_dedup_key := 'deliverable_review:' || NEW.id || ':' || NEW.review_status || ':' || now()::date;

      INSERT INTO public.agent_inbox_items (
        agent_id, agent_slug, event_type, task_id,
        summary, dedup_key, context, tenant_id
      ) VALUES (
        v_agent.id,
        v_agent.slug,
        'deliverable_review',
        NEW.owner_id,
        CASE
          WHEN NEW.review_status = 'revision_requested'
            THEN 'Revision requested on deliverable: ' || COALESCE(NEW.label, 'Untitled')
          ELSE 'Deliverable rejected: ' || COALESCE(NEW.label, 'Untitled')
        END,
        v_dedup_key,
        jsonb_build_object(
          'deliverable_id', NEW.id,
          'deliverable_label', NEW.label,
          'review_status', NEW.review_status,
          'review_note', NEW.review_note
        ),
        v_agent.tenant_id
      ) ON CONFLICT ON CONSTRAINT uq_inbox_dedup DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION notify_deliverable_review() TO authenticated, service_role;
