-- 010_tasks_streams.sql — Streams, tasks, recurring task series, and scheduling.

-- ── Streams ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS streams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  color       text DEFAULT '#6b7280',
  icon        text,
  sort_order  integer DEFAULT 0,
  type        stream_type NOT NULL DEFAULT 'functional',
  is_archived boolean DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_streams_tenant ON streams(tenant_id);

DROP TRIGGER IF EXISTS streams_updated_at ON streams;
CREATE TRIGGER streams_updated_at
  BEFORE UPDATE ON streams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Tasks ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  tenant_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  title                text NOT NULL,
  description          text,
  status               task_status NOT NULL DEFAULT 'todo',
  priority             task_priority,
  stream_id            uuid REFERENCES streams(id) ON DELETE SET NULL,
  parent_id            uuid REFERENCES tasks(id) ON DELETE CASCADE,
  assignee_type        actor_type,
  assignee_agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  model_override       text,
  thinking_override    text,
  due_date             timestamptz,
  completed_at         timestamptz,
  linked_entity_type   text,
  linked_entity_id     uuid,
  contact_id           uuid REFERENCES contacts(id) ON DELETE SET NULL,
  org_id               uuid REFERENCES organizations(id) ON DELETE SET NULL,
  series_id            uuid,
  series_occurrence_at timestamptz,
  is_recurring         boolean DEFAULT false,
  recurrence_rule      text,
  last_completed_at    timestamptz,
  tags                 text[] NOT NULL DEFAULT '{}',
  sort_order           integer DEFAULT 0,
  archived_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_stream ON tasks(stream_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_agent_active ON tasks(assignee_agent_id, status, due_date)
  WHERE archived_at IS NULL AND assignee_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_tasks_series_history
  ON tasks(series_id, series_occurrence_at DESC) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_due_date_active
  ON tasks (tenant_id, due_date ASC NULLS LAST)
  WHERE archived_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_overdue_scan
  ON tasks (status, due_date)
  WHERE archived_at IS NULL
    AND status NOT IN ('done', 'cancelled', 'missed');

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_series_occurrence_key UNIQUE (series_id, series_occurrence_at);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-set completed_at
CREATE OR REPLACE FUNCTION sync_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD IS NULL OR OLD.status != 'done') THEN
    NEW.completed_at = now();
  ELSIF NEW.status != 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_completion ON tasks;
CREATE TRIGGER tasks_sync_completion
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION sync_task_completion();

-- ── Recurring tasks: task_series ──────────────────────────────────

CREATE TABLE IF NOT EXISTS task_series (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  tenant_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,

  -- task template fields
  stream_id             uuid REFERENCES streams(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  description           text,
  priority              task_priority NOT NULL DEFAULT 'medium',
  assignee_type         actor_type,
  assignee_agent_id     uuid REFERENCES agents(id) ON DELETE SET NULL,
  model_override        text,
  thinking_override     text,
  tags                  text[] NOT NULL DEFAULT '{}',
  linked_entity_type    text,
  linked_entity_id      uuid,
  meta                  jsonb NOT NULL DEFAULT '{}',

  -- cadence
  cadence_type          text NOT NULL
    CHECK (cadence_type IN ('daily','weekdays','weekly','monthly','every_n_days')),
  interval_n            integer NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
  days_of_week          smallint[] NOT NULL DEFAULT '{}',
  day_of_month          smallint,
  time_of_day           time NOT NULL DEFAULT '09:00',
  timezone              text NOT NULL CHECK (is_valid_timezone(timezone)),

  -- lifecycle
  is_paused             boolean NOT NULL DEFAULT false,
  starts_on             date NOT NULL DEFAULT current_date,
  ends_on               date,
  ends_after_count      integer,
  spawned_count         integer NOT NULL DEFAULT 0,
  next_occurrence_at    timestamptz,
  last_spawned_at       timestamptz,
  missed_policy         text NOT NULL DEFAULT 'auto_skip'
    CHECK (missed_policy IN ('auto_skip','queue'))
);

CREATE OR REPLACE FUNCTION validate_days_of_week()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.days_of_week IS NOT NULL AND array_length(NEW.days_of_week, 1) > 0 THEN
    IF EXISTS (SELECT 1 FROM unnest(NEW.days_of_week) AS v WHERE v < 0 OR v > 6) THEN
      RAISE EXCEPTION 'days_of_week values must be between 0 (Sun) and 6 (Sat)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_series_validate_days ON task_series;
CREATE TRIGGER task_series_validate_days
  BEFORE INSERT OR UPDATE ON task_series
  FOR EACH ROW EXECUTE FUNCTION validate_days_of_week();

CREATE INDEX IF NOT EXISTS idx_task_series_tenant ON task_series(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_series_next_due
  ON task_series(next_occurrence_at) WHERE NOT is_paused;
CREATE INDEX IF NOT EXISTS idx_task_series_stream ON task_series(stream_id);
CREATE INDEX IF NOT EXISTS idx_task_series_assignee ON task_series(assignee_agent_id);

DROP TRIGGER IF EXISTS task_series_updated_at ON task_series;
CREATE TRIGGER task_series_updated_at
  BEFORE UPDATE ON task_series FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Propagate model overrides from series template to spawned tasks.
CREATE OR REPLACE FUNCTION propagate_series_model_overrides()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.series_id IS NOT NULL AND NEW.model_override IS NULL AND NEW.thinking_override IS NULL THEN
    UPDATE public.tasks t SET
      model_override = s.model_override,
      thinking_override = s.thinking_override
    FROM public.task_series s
    WHERE s.id = NEW.series_id
      AND t.id = NEW.id
      AND (s.model_override IS NOT NULL OR s.thinking_override IS NOT NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_propagate_series_model ON tasks;
CREATE TRIGGER tasks_propagate_series_model
  AFTER INSERT ON tasks
  FOR EACH ROW
  WHEN (NEW.series_id IS NOT NULL)
  EXECUTE FUNCTION propagate_series_model_overrides();

GRANT EXECUTE ON FUNCTION propagate_series_model_overrides() TO authenticated, service_role;

-- Attach the deferred FK from tasks.series_id -> task_series.id
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_series_id_fkey FOREIGN KEY (series_id) REFERENCES task_series(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- ── next_occurrence() — Compute next UTC occurrence ───────────────

CREATE OR REPLACE FUNCTION next_occurrence(
  p_series task_series,
  p_from_ts timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_tz             text := p_series.timezone;
  v_from_local     timestamp;
  v_local_date     date;
  v_candidate_local timestamp;
  v_candidate_utc  timestamptz;
  v_dow_local      int;
  v_dom            int;
  v_y              int;
  v_m              int;
  v_last_day       int;
  v_i              int;
BEGIN
  v_from_local := (p_from_ts AT TIME ZONE v_tz);
  v_local_date := v_from_local::date;

  IF p_series.cadence_type = 'daily' OR p_series.cadence_type = 'every_n_days' THEN
    v_candidate_local := (v_local_date::timestamp + p_series.time_of_day::interval);
    IF v_candidate_local <= v_from_local THEN
      v_candidate_local := ((v_local_date + (p_series.interval_n || ' days')::interval)::date::timestamp)
                         + p_series.time_of_day::interval;
    END IF;

  ELSIF p_series.cadence_type = 'weekdays' THEN
    v_candidate_local := (v_local_date::timestamp + p_series.time_of_day::interval);
    IF v_candidate_local <= v_from_local THEN
      v_candidate_local := ((v_local_date + interval '1 day')::date::timestamp)
                         + p_series.time_of_day::interval;
    END IF;
    WHILE extract(dow from v_candidate_local)::int IN (0, 6) LOOP
      v_candidate_local := v_candidate_local + interval '1 day';
    END LOOP;

  ELSIF p_series.cadence_type = 'weekly' THEN
    IF p_series.days_of_week IS NULL OR array_length(p_series.days_of_week, 1) IS NULL THEN
      v_candidate_local := (v_local_date::timestamp + p_series.time_of_day::interval);
      IF v_candidate_local <= v_from_local THEN
        v_candidate_local := ((v_local_date + (p_series.interval_n * 7 || ' days')::interval)::date::timestamp)
                           + p_series.time_of_day::interval;
      END IF;
    ELSE
      v_candidate_local := NULL;
      FOR v_i IN 0 .. (7 * p_series.interval_n) LOOP
        v_candidate_local := ((v_local_date + (v_i || ' days')::interval)::date::timestamp)
                           + p_series.time_of_day::interval;
        v_dow_local := extract(dow from v_candidate_local)::int;
        IF v_dow_local = ANY (p_series.days_of_week) AND v_candidate_local > v_from_local THEN
          EXIT;
        END IF;
        v_candidate_local := NULL;
      END LOOP;
    END IF;

  ELSIF p_series.cadence_type = 'monthly' THEN
    v_dom := COALESCE(p_series.day_of_month, 1);
    v_y := extract(year from v_local_date)::int;
    v_m := extract(month from v_local_date)::int;
    v_last_day := extract(day from (make_date(v_y, v_m, 1) + interval '1 month - 1 day'))::int;
    v_candidate_local := (make_date(
        v_y, v_m,
        CASE WHEN v_dom = -1 THEN v_last_day ELSE LEAST(v_dom, v_last_day) END
      )::timestamp + p_series.time_of_day::interval);
    IF v_candidate_local <= v_from_local THEN
      v_m := v_m + 1;
      IF v_m > 12 THEN v_m := 1; v_y := v_y + 1; END IF;
      v_last_day := extract(day from (make_date(v_y, v_m, 1) + interval '1 month - 1 day'))::int;
      v_candidate_local := (make_date(
          v_y, v_m,
          CASE WHEN v_dom = -1 THEN v_last_day ELSE LEAST(v_dom, v_last_day) END
        )::timestamp + p_series.time_of_day::interval);
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown cadence_type: %', p_series.cadence_type;
  END IF;

  IF v_candidate_local IS NULL THEN RETURN NULL; END IF;
  v_candidate_utc := (v_candidate_local AT TIME ZONE v_tz);
  RETURN v_candidate_utc;
END;
$$;

-- ── Sync next_occurrence_at on cadence changes ────────────────────

CREATE OR REPLACE FUNCTION task_series_sync_next_occurrence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_from timestamptz;
BEGIN
  IF NEW.is_paused THEN
    NEW.next_occurrence_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.ends_after_count IS NOT NULL AND NEW.spawned_count >= NEW.ends_after_count THEN
    NEW.is_paused := true;
    NEW.next_occurrence_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR
     NEW.cadence_type IS DISTINCT FROM OLD.cadence_type OR
     NEW.interval_n   IS DISTINCT FROM OLD.interval_n OR
     NEW.days_of_week IS DISTINCT FROM OLD.days_of_week OR
     NEW.day_of_month IS DISTINCT FROM OLD.day_of_month OR
     NEW.time_of_day  IS DISTINCT FROM OLD.time_of_day OR
     NEW.timezone     IS DISTINCT FROM OLD.timezone OR
     NEW.starts_on    IS DISTINCT FROM OLD.starts_on OR
     (OLD.is_paused AND NOT NEW.is_paused)
  THEN
    v_from := GREATEST(
      (NEW.starts_on::timestamp AT TIME ZONE NEW.timezone) - interval '1 second',
      now()
    );
    NEW.next_occurrence_at := public.next_occurrence(NEW, v_from);
  END IF;

  IF NEW.ends_on IS NOT NULL
     AND NEW.next_occurrence_at IS NOT NULL
     AND (NEW.next_occurrence_at AT TIME ZONE NEW.timezone)::date > NEW.ends_on
  THEN
    NEW.is_paused := true;
    NEW.next_occurrence_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_series_sync ON task_series;
CREATE TRIGGER task_series_sync
  BEFORE INSERT OR UPDATE ON task_series
  FOR EACH ROW EXECUTE FUNCTION task_series_sync_next_occurrence();

-- ── spawn_due_task_instances (tenant-scoped) ──────────────────────

CREATE OR REPLACE FUNCTION spawn_due_task_instances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series          public.task_series;
  v_new_task_id     uuid;
  v_prior           public.tasks;
  v_occurrence_at   timestamptz;
  v_next_after      timestamptz;
  v_catchup_skipped int;
  v_meta            jsonb;
BEGIN
  FOR v_series IN
    SELECT ts.* FROM public.task_series ts
    JOIN public.tenants t ON t.id = ts.tenant_id
    WHERE t.status = 'active'
      AND NOT ts.is_paused
      AND ts.next_occurrence_at IS NOT NULL
      AND ts.next_occurrence_at <= now()
      AND (ts.ends_on IS NULL OR (ts.next_occurrence_at AT TIME ZONE ts.timezone)::date <= ts.ends_on)
      AND (ts.ends_after_count IS NULL OR ts.spawned_count < ts.ends_after_count)
    FOR UPDATE OF ts SKIP LOCKED
  LOOP
    v_occurrence_at := v_series.next_occurrence_at;
    v_catchup_skipped := 0;

    LOOP
      v_next_after := public.next_occurrence(v_series, v_occurrence_at);
      EXIT WHEN v_next_after IS NULL OR v_next_after > now();
      v_occurrence_at := v_next_after;
      v_catchup_skipped := v_catchup_skipped + 1;
    END LOOP;

    IF v_series.missed_policy = 'auto_skip' THEN
      SELECT * INTO v_prior FROM public.tasks
      WHERE series_id = v_series.id
        AND status NOT IN ('done','cancelled','missed')
      ORDER BY series_occurrence_at DESC
      LIMIT 1;

      IF v_prior.id IS NOT NULL THEN
        UPDATE public.tasks SET status = 'missed' WHERE id = v_prior.id;
        INSERT INTO public.audit_log (actor_type, module, entity_type, entity_id, action, summary, meta, tenant_id)
        VALUES (
          'system', 'tasks', 'task', v_prior.id, 'status_changed',
          'Auto-missed: new occurrence spawned before completion',
          jsonb_build_object('series_id', v_series.id, 'reason', 'recurring_auto_skip'),
          v_series.tenant_id
        );
      END IF;
    END IF;

    v_meta := v_series.meta;
    IF v_catchup_skipped > 0 THEN
      v_meta := v_meta || jsonb_build_object('catchup_skipped', v_catchup_skipped);
    END IF;

    INSERT INTO public.tasks (
      stream_id, title, description, priority,
      assignee_type, assignee_agent_id, tags,
      linked_entity_type, linked_entity_id,
      model_override, thinking_override,
      series_id, series_occurrence_at, due_date,
      tenant_id
    ) VALUES (
      v_series.stream_id, v_series.title, v_series.description, v_series.priority,
      v_series.assignee_type, v_series.assignee_agent_id, v_series.tags,
      v_series.linked_entity_type, v_series.linked_entity_id,
      v_series.model_override, v_series.thinking_override,
      v_series.id, v_occurrence_at, v_occurrence_at,
      v_series.tenant_id
    )
    ON CONFLICT (series_id, series_occurrence_at) DO NOTHING
    RETURNING id INTO v_new_task_id;

    IF v_new_task_id IS NOT NULL THEN
      INSERT INTO public.audit_log (actor_type, module, entity_type, entity_id, action, summary, meta, tenant_id)
      VALUES (
        'system', 'tasks', 'task', v_new_task_id, 'created',
        'Recurring instance spawned: ' || v_series.title,
        jsonb_build_object(
          'series_id', v_series.id,
          'occurrence_at', v_occurrence_at,
          'catchup_skipped', v_catchup_skipped
        ),
        v_series.tenant_id
      );
    END IF;

    UPDATE public.task_series
    SET spawned_count      = spawned_count + 1,
        last_spawned_at    = now(),
        next_occurrence_at = public.next_occurrence(v_series, v_occurrence_at)
    WHERE id = v_series.id;

    UPDATE public.task_series
    SET is_paused = true, next_occurrence_at = NULL
    WHERE id = v_series.id
      AND (
        (ends_after_count IS NOT NULL AND spawned_count >= ends_after_count)
        OR (next_occurrence_at IS NOT NULL AND ends_on IS NOT NULL
            AND (next_occurrence_at AT TIME ZONE timezone)::date > ends_on)
      );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.spawn_due_task_instances() TO service_role;

-- Diagnostic helper for inspecting recurring-task state from the app.
DROP FUNCTION IF EXISTS recurring_tasks_debug();
CREATE OR REPLACE FUNCTION recurring_tasks_debug()
RETURNS TABLE (
  series_id uuid,
  title text,
  is_paused boolean,
  next_occurrence_at timestamptz,
  now_at timestamptz,
  seconds_until_next double precision,
  spawned_count integer,
  last_spawned_at timestamptz,
  cadence_type text,
  time_of_day time,
  timezone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.is_paused, s.next_occurrence_at, now(),
    EXTRACT(EPOCH FROM (s.next_occurrence_at - now())),
    s.spawned_count, s.last_spawned_at, s.cadence_type, s.time_of_day, s.timezone
  FROM public.task_series s
  WHERE s.tenant_id = public.current_tenant_id()
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.recurring_tasks_debug() TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────

ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON streams;
CREATE POLICY "Tenant isolation" ON streams
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON streams;
CREATE POLICY "Service role full access" ON streams
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON tasks;
CREATE POLICY "Tenant isolation" ON tasks
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON tasks;
CREATE POLICY "Service role full access" ON tasks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE task_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON task_series;
CREATE POLICY "Tenant isolation" ON task_series
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON task_series;
CREATE POLICY "Service role full access" ON task_series
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON streams TO authenticated, service_role;
GRANT ALL ON tasks TO authenticated, service_role;
GRANT ALL ON task_series TO authenticated, service_role;

-- ── Realtime ──────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE streams;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE streams REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE tasks REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_series;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE task_series REPLICA IDENTITY FULL;

-- ── pg_cron: spawn due tasks every minute ─────────────────────────

DO $$ BEGIN PERFORM cron.unschedule('spawn-due-task-instances'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'spawn-due-task-instances',
  '* * * * *',
  $cron$SELECT public.spawn_due_task_instances();$cron$
);
