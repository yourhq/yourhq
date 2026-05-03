-- 024_routines_extension.sql — Extend routine event triggers to
-- collection_records, knowledge_items, and tasks.
--
-- Adds Postgres AFTER INSERT/UPDATE triggers that evaluate routines
-- with matching entity_type and fire inbox items when conditions match.

-- ── process_collection_record_routine() ──────────────────────────

CREATE OR REPLACE FUNCTION process_collection_record_routine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  v_old_value text;
  v_new_value text;
  v_matched boolean;
BEGIN
  FOR r IN
    SELECT *
    FROM public.routines
    WHERE is_active = true
      AND trigger_type = 'event'
      AND entity_type = 'collection_record'
      AND (collection_id IS NULL OR collection_id = NEW.collection_id)
  LOOP
    v_matched := false;

    IF r.condition = 'created' AND TG_OP = 'INSERT' THEN
      v_matched := true;
    ELSIF r.condition = 'any_change' AND TG_OP = 'UPDATE' THEN
      IF r.field IS NOT NULL THEN
        v_old_value := OLD."values"->>r.field;
        v_new_value := NEW."values"->>r.field;
        v_matched := (v_old_value IS DISTINCT FROM v_new_value);
      ELSE
        v_matched := (OLD."values"::text IS DISTINCT FROM NEW."values"::text);
      END IF;
    ELSIF r.condition = 'changed_to' AND TG_OP = 'UPDATE' AND r.field IS NOT NULL THEN
      v_old_value := OLD."values"->>r.field;
      v_new_value := NEW."values"->>r.field;
      v_matched := (v_old_value IS DISTINCT FROM v_new_value) AND v_new_value = r.value;
    ELSIF r.condition = 'changed_from' AND TG_OP = 'UPDATE' AND r.field IS NOT NULL THEN
      v_old_value := OLD."values"->>r.field;
      v_new_value := NEW."values"->>r.field;
      v_matched := (v_old_value IS DISTINCT FROM v_new_value) AND v_old_value = r.value;
    END IF;

    IF v_matched THEN
      INSERT INTO public.agent_inbox_items (
        agent_id, agent_slug, tenant_id,
        event_type, status, summary, context, dedup_key
      ) VALUES (
        r.agent_id, r.agent_slug, NEW.tenant_id,
        'routine_event', 'pending',
        COALESCE(r.instruction, r.name),
        jsonb_build_object(
          'routine_id', r.id,
          'routine_name', r.name,
          'routine_instruction', r.instruction,
          'entity_type', 'collection_record',
          'entity_id', NEW.id,
          'collection_id', NEW.collection_id,
          'field', r.field,
          'condition', r.condition,
          'old_value', CASE WHEN TG_OP = 'UPDATE' THEN v_old_value ELSE NULL END,
          'new_value', CASE WHEN r.field IS NOT NULL THEN NEW."values"->>r.field ELSE NULL END
        ),
        'routine_event:' || r.id || ':' || NEW.id || ':' || to_char(now(), 'YYYY-MM-DD-HH24-MI')
      )
      ON CONFLICT (dedup_key) DO NOTHING;

      UPDATE public.routines
      SET last_run_at = now(), run_count = run_count + 1
      WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS collection_record_routine_trigger ON collection_records;
CREATE TRIGGER collection_record_routine_trigger
  AFTER INSERT OR UPDATE ON collection_records
  FOR EACH ROW EXECUTE FUNCTION process_collection_record_routine();

-- ── process_knowledge_item_routine() ─────────────────────────────

CREATE OR REPLACE FUNCTION process_knowledge_item_routine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  v_matched boolean;
BEGIN
  FOR r IN
    SELECT *
    FROM public.routines
    WHERE is_active = true
      AND trigger_type = 'event'
      AND entity_type = 'knowledge_item'
  LOOP
    v_matched := false;

    IF r.condition = 'created' AND TG_OP = 'INSERT' THEN
      v_matched := true;
    ELSIF r.condition = 'any_change' AND TG_OP = 'UPDATE' THEN
      v_matched := true;
    END IF;

    IF v_matched THEN
      INSERT INTO public.agent_inbox_items (
        agent_id, agent_slug, tenant_id,
        event_type, status, summary, context, dedup_key
      ) VALUES (
        r.agent_id, r.agent_slug, NEW.tenant_id,
        'routine_event', 'pending',
        COALESCE(r.instruction, r.name),
        jsonb_build_object(
          'routine_id', r.id,
          'routine_name', r.name,
          'routine_instruction', r.instruction,
          'entity_type', 'knowledge_item',
          'entity_id', NEW.id,
          'title', NEW.title,
          'kind', NEW.kind
        ),
        'routine_event:' || r.id || ':' || NEW.id || ':' || to_char(now(), 'YYYY-MM-DD-HH24-MI')
      )
      ON CONFLICT (dedup_key) DO NOTHING;

      UPDATE public.routines
      SET last_run_at = now(), run_count = run_count + 1
      WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_item_routine_trigger ON knowledge_items;
CREATE TRIGGER knowledge_item_routine_trigger
  AFTER INSERT OR UPDATE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION process_knowledge_item_routine();

-- ── process_task_routine() ───────────────────────────────────────

CREATE OR REPLACE FUNCTION process_task_routine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r RECORD;
  v_old_value text;
  v_new_value text;
  v_matched boolean;
BEGIN
  FOR r IN
    SELECT *
    FROM public.routines
    WHERE is_active = true
      AND trigger_type = 'event'
      AND entity_type = 'task'
  LOOP
    v_matched := false;

    IF r.condition = 'created' AND TG_OP = 'INSERT' THEN
      v_matched := true;
    ELSIF r.condition = 'any_change' AND TG_OP = 'UPDATE' THEN
      IF r.field IS NOT NULL THEN
        EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', r.field, r.field)
          INTO v_old_value, v_new_value USING OLD, NEW;
        v_matched := (v_old_value IS DISTINCT FROM v_new_value);
      ELSE
        v_matched := true;
      END IF;
    ELSIF r.condition = 'changed_to' AND TG_OP = 'UPDATE' AND r.field IS NOT NULL THEN
      EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', r.field, r.field)
        INTO v_old_value, v_new_value USING OLD, NEW;
      v_matched := (v_old_value IS DISTINCT FROM v_new_value) AND v_new_value = r.value;
    ELSIF r.condition = 'changed_from' AND TG_OP = 'UPDATE' AND r.field IS NOT NULL THEN
      EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', r.field, r.field)
        INTO v_old_value, v_new_value USING OLD, NEW;
      v_matched := (v_old_value IS DISTINCT FROM v_new_value) AND v_old_value = r.value;
    END IF;

    IF v_matched THEN
      INSERT INTO public.agent_inbox_items (
        agent_id, agent_slug, tenant_id,
        event_type, status, summary, context, dedup_key
      ) VALUES (
        r.agent_id, r.agent_slug, NEW.tenant_id,
        'routine_event', 'pending',
        COALESCE(r.instruction, r.name),
        jsonb_build_object(
          'routine_id', r.id,
          'routine_name', r.name,
          'routine_instruction', r.instruction,
          'entity_type', 'task',
          'entity_id', NEW.id,
          'task_title', NEW.title,
          'field', r.field,
          'condition', r.condition,
          'old_value', v_old_value,
          'new_value', v_new_value
        ),
        'routine_event:' || r.id || ':' || NEW.id || ':' || to_char(now(), 'YYYY-MM-DD-HH24-MI')
      )
      ON CONFLICT (dedup_key) DO NOTHING;

      UPDATE public.routines
      SET last_run_at = now(), run_count = run_count + 1
      WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_routine_trigger ON tasks;
CREATE TRIGGER task_routine_trigger
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION process_task_routine();

-- ── Grants ────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION process_collection_record_routine() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION process_knowledge_item_routine() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION process_task_routine() TO authenticated, service_role;

-- ── Schema version ────────────────────────────────────────────────

INSERT INTO _schema_version (version) VALUES (24)
ON CONFLICT (version) DO NOTHING;
