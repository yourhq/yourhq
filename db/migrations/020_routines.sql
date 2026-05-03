-- 020_routines.sql — Unified routines: scheduled and event-driven agent behaviors.

-- ── Extend inbox_event_type ──────────────────────────────────────────

ALTER TYPE inbox_event_type ADD VALUE IF NOT EXISTS 'routine_schedule';
ALTER TYPE inbox_event_type ADD VALUE IF NOT EXISTS 'routine_event';

-- ── routines table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS routines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_slug      text NOT NULL,
  name            text NOT NULL,
  instruction     text NOT NULL DEFAULT '',
  trigger_type    text NOT NULL CHECK (trigger_type IN ('schedule','event')),
  is_active       boolean NOT NULL DEFAULT true,

  -- Schedule fields
  cadence_type    text CHECK (cadence_type IS NULL OR cadence_type IN (
    'every_n_minutes','every_n_hours','daily','weekdays','weekly','monthly','every_n_days'
  )),
  interval_n      integer,
  days_of_week    smallint[] DEFAULT '{}',
  day_of_month    smallint,
  time_of_day     time,
  timezone        text,
  next_run_at     timestamptz,
  last_run_at     timestamptz,
  run_count       integer NOT NULL DEFAULT 0,

  -- Event fields
  entity_type     text CHECK (entity_type IS NULL OR entity_type IN (
    'contact','collection_record','knowledge_item','task'
  )),
  collection_id   uuid,
  field           text,
  condition       text CHECK (condition IS NULL OR condition IN (
    'created','changed_to','changed_from','any_change'
  )),
  value           text,

  meta            jsonb NOT NULL DEFAULT '{}',
  archived_at     timestamptz,

  CONSTRAINT routines_schedule_check CHECK (
    trigger_type != 'schedule' OR (cadence_type IS NOT NULL AND timezone IS NOT NULL)
  ),
  CONSTRAINT routines_timezone_valid CHECK (
    timezone IS NULL OR is_valid_timezone(timezone)
  ),
  CONSTRAINT routines_event_check CHECK (
    trigger_type != 'event' OR (entity_type IS NOT NULL AND condition IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_routines_tenant    ON routines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_routines_agent     ON routines (agent_id);
CREATE INDEX IF NOT EXISTS idx_routines_agent_active ON routines (agent_id, is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_routines_next_run  ON routines (next_run_at) WHERE is_active AND trigger_type = 'schedule';
CREATE INDEX IF NOT EXISTS idx_routines_entity    ON routines (entity_type, condition) WHERE is_active AND trigger_type = 'event';

CREATE TRIGGER set_routines_updated_at
  BEFORE UPDATE ON routines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON routines
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "Service role full access" ON routines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ─────────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE routines;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE routines REPLICA IDENTITY FULL;

-- ── Grants ───────────────────────────────────────────────────────────

GRANT ALL ON routines TO authenticated, service_role;

-- ── routine_next_occurrence() ────────────────────────────────────────

CREATE OR REPLACE FUNCTION routine_next_occurrence(
  p_cadence_type    text,
  p_interval_n      integer,
  p_days_of_week    smallint[],
  p_day_of_month    smallint,
  p_time_of_day     time,
  p_timezone        text,
  p_from            timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_local      timestamp;
  v_candidate  timestamp;
  v_dow        smallint;
  v_i          integer;
BEGIN
  v_local := (p_from AT TIME ZONE COALESCE(p_timezone, 'UTC'))::timestamp;

  CASE p_cadence_type
    WHEN 'every_n_minutes' THEN
      RETURN p_from + (COALESCE(p_interval_n, 15) || ' minutes')::interval;

    WHEN 'every_n_hours' THEN
      RETURN p_from + (COALESCE(p_interval_n, 1) || ' hours')::interval;

    WHEN 'daily' THEN
      v_candidate := date_trunc('day', v_local) + COALESCE(p_time_of_day, '09:00'::time);
      IF v_candidate <= v_local THEN
        v_candidate := v_candidate + interval '1 day';
      END IF;
      RETURN (v_candidate::text || ' ' || COALESCE(p_timezone, 'UTC'))::timestamptz;

    WHEN 'weekdays' THEN
      v_candidate := date_trunc('day', v_local) + COALESCE(p_time_of_day, '09:00'::time);
      IF v_candidate <= v_local THEN
        v_candidate := v_candidate + interval '1 day';
      END IF;
      WHILE EXTRACT(isodow FROM v_candidate) > 5 LOOP
        v_candidate := v_candidate + interval '1 day';
      END LOOP;
      RETURN (v_candidate::text || ' ' || COALESCE(p_timezone, 'UTC'))::timestamptz;

    WHEN 'weekly' THEN
      IF array_length(p_days_of_week, 1) IS NULL OR array_length(p_days_of_week, 1) = 0 THEN
        v_candidate := date_trunc('day', v_local) + COALESCE(p_time_of_day, '09:00'::time) + interval '7 days';
        RETURN (v_candidate::text || ' ' || COALESCE(p_timezone, 'UTC'))::timestamptz;
      END IF;
      v_candidate := date_trunc('day', v_local) + COALESCE(p_time_of_day, '09:00'::time);
      IF v_candidate <= v_local THEN
        v_candidate := v_candidate + interval '1 day';
      END IF;
      FOR v_i IN 1..8 LOOP
        v_dow := EXTRACT(isodow FROM v_candidate)::smallint;
        IF v_dow = ANY(p_days_of_week) THEN
          RETURN (v_candidate::text || ' ' || COALESCE(p_timezone, 'UTC'))::timestamptz;
        END IF;
        v_candidate := v_candidate + interval '1 day';
      END LOOP;
      RETURN (v_candidate::text || ' ' || COALESCE(p_timezone, 'UTC'))::timestamptz;

    WHEN 'monthly' THEN
      v_candidate := date_trunc('month', v_local)
        + ((COALESCE(p_day_of_month, 1) - 1) || ' days')::interval
        + COALESCE(p_time_of_day, '09:00'::time);
      IF v_candidate <= v_local THEN
        v_candidate := date_trunc('month', v_local + interval '1 month')
          + ((COALESCE(p_day_of_month, 1) - 1) || ' days')::interval
          + COALESCE(p_time_of_day, '09:00'::time);
      END IF;
      RETURN (v_candidate::text || ' ' || COALESCE(p_timezone, 'UTC'))::timestamptz;

    WHEN 'every_n_days' THEN
      v_candidate := date_trunc('day', v_local) + COALESCE(p_time_of_day, '09:00'::time);
      IF v_candidate <= v_local THEN
        v_candidate := v_candidate + (COALESCE(p_interval_n, 1) || ' days')::interval;
      END IF;
      RETURN (v_candidate::text || ' ' || COALESCE(p_timezone, 'UTC'))::timestamptz;

    ELSE
      RETURN p_from + interval '1 day';
  END CASE;
END;
$$;

GRANT EXECUTE ON FUNCTION routine_next_occurrence(text, integer, smallint[], smallint, time, text, timestamptz) TO authenticated, service_role;

-- ── spawn_routine_schedule_items() ───────────────────────────────────

CREATE OR REPLACE FUNCTION spawn_routine_schedule_items()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_routine  record;
  v_next     timestamptz;
BEGIN
  FOR v_routine IN
    SELECT id, agent_id, agent_slug, tenant_id, name, instruction,
           cadence_type, interval_n, days_of_week, day_of_month,
           time_of_day, timezone
    FROM public.routines
    WHERE trigger_type = 'schedule'
      AND is_active = true
      AND archived_at IS NULL
      AND next_run_at IS NOT NULL
      AND next_run_at <= now()
  LOOP
    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, tenant_id,
      event_type, status, summary, context, dedup_key
    ) VALUES (
      v_routine.agent_id, v_routine.agent_slug, v_routine.tenant_id,
      'routine_schedule', 'pending',
      COALESCE(v_routine.instruction, v_routine.name),
      jsonb_build_object(
        'routine_id', v_routine.id,
        'routine_name', v_routine.name,
        'instruction', v_routine.instruction
      ),
      'routine:' || v_routine.id || ':' || to_char(now(), 'YYYY-MM-DD-HH24-MI')
    )
    ON CONFLICT (dedup_key) DO NOTHING;

    v_next := public.routine_next_occurrence(
      v_routine.cadence_type, v_routine.interval_n,
      v_routine.days_of_week, v_routine.day_of_month,
      v_routine.time_of_day, v_routine.timezone, now()
    );

    UPDATE public.routines
    SET next_run_at = v_next,
        last_run_at = now(),
        run_count = run_count + 1
    WHERE id = v_routine.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION spawn_routine_schedule_items() TO authenticated, service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('spawn_routine_schedule_items');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'spawn_routine_schedule_items',
  '* * * * *',
  'SELECT spawn_routine_schedule_items()'
);

-- ── process_routine_event() ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_routine_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_routine  record;
  v_matches  boolean;
  v_old_val  text;
  v_new_val  text;
  v_summary  text;
BEGIN
  FOR v_routine IN
    SELECT id, agent_id, agent_slug, tenant_id, name, instruction,
           field, condition, value
    FROM public.routines
    WHERE trigger_type = 'event'
      AND entity_type = 'contact'
      AND is_active = true
      AND archived_at IS NULL
      AND tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
  LOOP
    v_matches := false;

    CASE v_routine.condition
      WHEN 'created' THEN
        v_matches := (TG_OP = 'INSERT');
      WHEN 'any_change' THEN
        IF TG_OP = 'UPDATE' AND v_routine.field IS NOT NULL THEN
          EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_routine.field, v_routine.field)
            INTO v_old_val, v_new_val USING OLD, NEW;
          v_matches := (v_old_val IS DISTINCT FROM v_new_val);
        ELSIF TG_OP = 'UPDATE' THEN
          v_matches := true;
        END IF;
      WHEN 'changed_to' THEN
        IF TG_OP = 'UPDATE' AND v_routine.field IS NOT NULL THEN
          EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_routine.field, v_routine.field)
            INTO v_old_val, v_new_val USING OLD, NEW;
          v_matches := (v_old_val IS DISTINCT FROM v_new_val) AND (v_new_val = v_routine.value);
        END IF;
      WHEN 'changed_from' THEN
        IF TG_OP = 'UPDATE' AND v_routine.field IS NOT NULL THEN
          EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', v_routine.field, v_routine.field)
            INTO v_old_val, v_new_val USING OLD, NEW;
          v_matches := (v_old_val IS DISTINCT FROM v_new_val) AND (v_old_val = v_routine.value);
        END IF;
    END CASE;

    IF v_matches THEN
      v_summary := v_routine.instruction;
      IF v_summary = '' OR v_summary IS NULL THEN
        v_summary := v_routine.name;
      END IF;
      v_summary := replace(v_summary, '{name}', COALESCE(NEW.name, ''));
      v_summary := replace(v_summary, '{old_value}', COALESCE(v_old_val, ''));
      v_summary := replace(v_summary, '{new_value}', COALESCE(v_new_val, ''));

      INSERT INTO public.agent_inbox_items (
        agent_id, agent_slug, tenant_id,
        event_type, status, summary, contact_id, context, dedup_key
      ) VALUES (
        v_routine.agent_id, v_routine.agent_slug, v_routine.tenant_id,
        'routine_event', 'pending', v_summary, NEW.id,
        jsonb_build_object(
          'routine_id', v_routine.id,
          'routine_name', v_routine.name,
          'instruction', v_routine.instruction,
          'entity_type', 'contact',
          'entity_id', NEW.id,
          'field', v_routine.field,
          'old_value', v_old_val,
          'new_value', v_new_val
        ),
        'routine_event:' || v_routine.id || ':' || NEW.id || ':' || to_char(now(), 'YYYY-MM-DD-HH24-MI')
      )
      ON CONFLICT (dedup_key) DO NOTHING;

      UPDATE public.routines
      SET last_run_at = now(),
          run_count = run_count + 1
      WHERE id = v_routine.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION process_routine_event() TO authenticated, service_role;

CREATE TRIGGER contact_routine_trigger
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION process_routine_event();
