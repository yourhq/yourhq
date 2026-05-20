-- Notify the submitting agent when a deliverable is approved (not just revision/rejection).
-- This lets the agent complete the task after all deliverables are approved.

CREATE OR REPLACE FUNCTION notify_deliverable_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent RECORD;
  v_dedup_key text;
BEGIN
  IF NEW.is_deliverable = false OR NEW.submitted_by_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.review_status IS DISTINCT FROM NEW.review_status
     AND NEW.review_status IN ('revision_requested', 'rejected', 'approved') THEN
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
        CASE WHEN NEW.owner_type = 'task' THEN NEW.owner_id ELSE NULL END,
        CASE
          WHEN NEW.review_status = 'revision_requested'
            THEN 'Revision requested on deliverable: ' || COALESCE(NEW.label, 'Untitled')
          WHEN NEW.review_status = 'rejected'
            THEN 'Deliverable rejected: ' || COALESCE(NEW.label, 'Untitled')
          ELSE 'Deliverable approved: ' || COALESCE(NEW.label, 'Untitled')
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
