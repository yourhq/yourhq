-- 020_rpc_tenant_scoped.sql — Update all RPCs and triggers to propagate tenant_id.
--
-- Functions use SECURITY DEFINER + service_role (bypasses RLS), so they
-- must explicitly filter by tenant_id. Triggers propagate tenant_id from
-- the source row into any child rows they create.

-- ── consume_gateway_token: propagate tenant_id ─────────────────────

CREATE OR REPLACE FUNCTION consume_gateway_token(
  p_token     text,
  p_label     text DEFAULT NULL,
  p_slug_hint text DEFAULT NULL,
  p_tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'
)
RETURNS TABLE (gateway_id uuid, gateway_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_hash text;
  v_token_row  public.gateway_registration_tokens%ROWTYPE;
  v_gateway_id uuid;
  v_slug       text;
  v_label      text;
BEGIN
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT * INTO v_token_row
    FROM public.gateway_registration_tokens
   WHERE token_hash = v_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '28000';
  END IF;

  IF v_token_row.consumed_at IS NOT NULL THEN
    RETURN QUERY
      SELECT g.id, g.slug
        FROM public.gateways g
       WHERE g.id = v_token_row.consumed_by_gateway_id;
    RETURN;
  END IF;

  IF v_token_row.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired' USING ERRCODE = '28000';
  END IF;

  v_label := COALESCE(
    NULLIF(trim(p_label),        ''),
    NULLIF(trim(v_token_row.label), ''),
    'Gateway'
  );
  v_slug := COALESCE(NULLIF(trim(p_slug_hint), ''), lower(regexp_replace(v_label, '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  IF v_slug = '' THEN v_slug := 'gateway'; END IF;

  IF EXISTS (SELECT 1 FROM public.gateways WHERE slug = v_slug AND tenant_id = p_tenant_id) THEN
    DECLARE
      v_suffix int := 2;
      v_try    text;
    BEGIN
      LOOP
        v_try := v_slug || '-' || v_suffix;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gateways WHERE slug = v_try AND tenant_id = p_tenant_id);
        v_suffix := v_suffix + 1;
      END LOOP;
      v_slug := v_try;
    END;
  END IF;

  INSERT INTO public.gateways (slug, label, status, tenant_id, meta)
  VALUES (v_slug, v_label, 'provisioning', p_tenant_id, jsonb_build_object('registered_via', 'token'))
  RETURNING id INTO v_gateway_id;

  UPDATE public.gateway_registration_tokens
     SET consumed_at = now(),
         consumed_by_gateway_id = v_gateway_id
   WHERE id = v_token_row.id;

  RETURN QUERY SELECT v_gateway_id, v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_gateway_token(text, text, text, uuid) TO anon, authenticated;

-- ── lease_command: filter by tenant (via gateway) ──────────────────

CREATE OR REPLACE FUNCTION lease_command(
  p_lease_seconds integer DEFAULT 300,
  p_gateway_slug text DEFAULT NULL
)
RETURNS SETOF agent_commands
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_gateway_id uuid;
BEGIN
  IF p_gateway_slug IS NOT NULL THEN
    SELECT id INTO v_gateway_id FROM public.gateways WHERE slug = p_gateway_slug;
  END IF;

  RETURN QUERY
  UPDATE public.agent_commands
  SET
    status = 'leased',
    leased_at = now(),
    leased_until = now() + (p_lease_seconds || ' seconds')::interval,
    updated_at = now()
  WHERE id = (
    SELECT id FROM public.agent_commands
    WHERE (status = 'pending' OR (status = 'leased' AND leased_until < now()))
      AND (
        p_gateway_slug IS NULL
        OR gateway_id IS NULL
        OR gateway_id = v_gateway_id
      )
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- ── lease_inbox_item: unchanged (already filters by agent_id, which is tenant-scoped) ──

-- ── complete_inbox_item / fail_inbox_item: unchanged (operate by PK) ──

-- ── start_command / complete_command / fail_command: unchanged (operate by PK) ──

-- ── enqueue_task_assignment: propagate tenant_id from task ──────────

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
        jsonb_build_object('task_title', NEW.title, 'task_status', NEW.status,
          'task_priority', NEW.priority, 'previous_agent_id', OLD.assignee_agent_id),
        v_agent.tenant_id
      ) ON CONFLICT (dedup_key) DO NOTHING;
    ELSE
      v_dedup_key := 'task_assignment:' || NEW.id || ':' || NEW.assignee_agent_id;
      INSERT INTO public.agent_inbox_items (agent_id, agent_slug, event_type, task_id, summary, dedup_key, context, tenant_id)
      VALUES (
        NEW.assignee_agent_id, v_agent.slug, 'task_assignment', NEW.id,
        'Task assigned: ' || COALESCE(NEW.title, 'Untitled'), v_dedup_key,
        jsonb_build_object('task_title', NEW.title, 'task_status', NEW.status, 'task_priority', NEW.priority),
        v_agent.tenant_id
      ) ON CONFLICT (dedup_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── enqueue_comment_mentions: propagate tenant_id from agent ───────

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
    SELECT id, slug, tenant_id INTO v_agent_record FROM public.agents WHERE slug = v_mention;
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
    ) ON CONFLICT (dedup_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── process_contact_automation: propagate tenant_id from rule/contact ──

CREATE OR REPLACE FUNCTION process_contact_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rule RECORD;
  v_dedup_key text;
  v_summary text;
  v_old_value text;
  v_new_value text;
BEGIN
  FOR v_rule IN
    SELECT * FROM public.automation_rules
    WHERE table_name = 'contacts' AND is_active = true
      AND tenant_id = NEW.tenant_id
  LOOP

    IF v_rule.condition = 'created' THEN
      IF TG_OP != 'INSERT' THEN CONTINUE; END IF;
      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':created';
      v_summary := replace(
        replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
        '{new_value}', ''
      );

    ELSIF v_rule.condition = 'changed_to' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_new_value IS NULL OR v_new_value != v_rule.value OR v_old_value = v_new_value THEN
        CONTINUE;
      END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':' || COALESCE(v_new_value, 'null') || ':' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    ELSIF v_rule.condition = 'changed_from' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_old_value IS NULL OR v_old_value != v_rule.value OR v_old_value = v_new_value THEN
        CONTINUE;
      END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':from_' || COALESCE(v_old_value, 'null') || ':' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    ELSIF v_rule.condition = 'any_change' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_old_value = v_new_value THEN CONTINUE; END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':any_' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    END IF;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type,
      contact_id, summary, dedup_key, context, tenant_id
    ) VALUES (
      v_rule.target_agent_id, v_rule.target_agent_slug,
      v_rule.event_type, NEW.id, v_summary, v_dedup_key,
      jsonb_build_object(
        'rule_id', v_rule.id, 'table', 'contacts',
        'field', v_rule.field, 'condition', v_rule.condition::text,
        'old_value', v_old_value, 'new_value', v_new_value,
        'contact_name', NEW.name, 'contact_status', NEW.status
      ),
      NEW.tenant_id
    ) ON CONFLICT (dedup_key) DO NOTHING;

  END LOOP;

  RETURN NEW;
END;
$$;

-- ── update_agent_budget_on_usage: propagate tenant_id ──────────────

CREATE OR REPLACE FUNCTION update_agent_budget_on_usage()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_anchor_tz   text;
  v_default_lim numeric(10,2);
  v_default_pct integer;
  v_default_cut boolean;
  v_period      date;
  v_old_status  budget_status;
  v_new_status  budget_status;
  v_tenant_id   uuid;
BEGIN
  IF NEW.agent_id IS NULL THEN RETURN NEW; END IF;

  v_tenant_id := NEW.tenant_id;

  SELECT
    default_agent_budget_usd,
    coalesce(default_soft_threshold_pct, 80),
    coalesce(default_hard_cutoff, true),
    coalesce(nullif(owner_timezone, ''), 'UTC')
  INTO v_default_lim, v_default_pct, v_default_cut, v_anchor_tz
  FROM public.workspace WHERE tenant_id = v_tenant_id LIMIT 1;

  INSERT INTO public.agent_budgets (
    agent_id, monthly_limit_usd, soft_threshold_pct, hard_cutoff,
    period_anchor_tz, current_period_start, tenant_id
  ) VALUES (
    NEW.agent_id, v_default_lim, v_default_pct, v_default_cut,
    v_anchor_tz,
    date_trunc('month', NEW.occurred_at AT TIME ZONE v_anchor_tz)::date,
    v_tenant_id
  ) ON CONFLICT (agent_id) DO NOTHING;

  SELECT status, period_anchor_tz
    INTO v_old_status, v_anchor_tz
    FROM public.agent_budgets
   WHERE agent_id = NEW.agent_id;

  v_period := date_trunc('month', NEW.occurred_at AT TIME ZONE v_anchor_tz)::date;

  UPDATE public.agent_budgets b SET
    current_period_start           = CASE WHEN v_period <> b.current_period_start
                                          THEN v_period ELSE b.current_period_start END,
    current_period_spend_usd       = CASE WHEN v_period <> b.current_period_start
                                          THEN coalesce(NEW.cost_total_usd, 0)
                                          ELSE b.current_period_spend_usd + coalesce(NEW.cost_total_usd, 0) END,
    current_period_tokens          = CASE WHEN v_period <> b.current_period_start
                                          THEN NEW.total_tokens
                                          ELSE b.current_period_tokens + NEW.total_tokens END,
    current_period_metered_calls   = CASE WHEN v_period <> b.current_period_start
                                          THEN (CASE WHEN NEW.cost_total_usd IS NOT NULL THEN 1 ELSE 0 END)
                                          ELSE b.current_period_metered_calls
                                             + (CASE WHEN NEW.cost_total_usd IS NOT NULL THEN 1 ELSE 0 END) END,
    current_period_unmetered_calls = CASE WHEN v_period <> b.current_period_start
                                          THEN (CASE WHEN NEW.cost_total_usd IS NULL THEN 1 ELSE 0 END)
                                          ELSE b.current_period_unmetered_calls
                                             + (CASE WHEN NEW.cost_total_usd IS NULL THEN 1 ELSE 0 END) END,
    warned_at                      = CASE WHEN v_period <> b.current_period_start THEN NULL ELSE b.warned_at END,
    exceeded_at                    = CASE WHEN v_period <> b.current_period_start THEN NULL ELSE b.exceeded_at END,
    last_usage_at                  = NEW.occurred_at
  WHERE b.agent_id = NEW.agent_id;

  UPDATE public.agent_budgets SET
    status =
      CASE
        WHEN monthly_limit_usd IS NULL                                            THEN 'ok'
        WHEN current_period_metered_calls = 0 AND current_period_unmetered_calls > 0 THEN 'unmetered'
        WHEN current_period_spend_usd >= monthly_limit_usd                        THEN 'exceeded'
        WHEN current_period_spend_usd >= monthly_limit_usd * soft_threshold_pct / 100.0 THEN 'warned'
        ELSE 'ok'
      END,
    warned_at   = CASE
                    WHEN current_period_spend_usd >= coalesce(monthly_limit_usd, 'Infinity'::numeric)
                                                   * soft_threshold_pct / 100.0
                     AND warned_at IS NULL THEN now() ELSE warned_at END,
    exceeded_at = CASE
                    WHEN current_period_spend_usd >= coalesce(monthly_limit_usd, 'Infinity'::numeric)
                     AND exceeded_at IS NULL THEN now() ELSE exceeded_at END
  WHERE agent_id = NEW.agent_id
  RETURNING status INTO v_new_status;

  IF v_old_status IS DISTINCT FROM 'warned' AND v_new_status = 'warned' THEN
    INSERT INTO public.notifications (type, title, body, entity_type, entity_id, actor_type, meta, tenant_id)
    SELECT 'budget.warned',
           'Agent ' || a.name || ' near monthly budget',
           'Spent $' || round(b.current_period_spend_usd, 2)::text
             || ' of $' || b.monthly_limit_usd::text,
           'agent_budget', b.agent_id, 'system',
           jsonb_build_object(
             'agent_id', b.agent_id,
             'period_start', b.current_period_start::text,
             'spend', b.current_period_spend_usd,
             'limit', b.monthly_limit_usd
           ),
           v_tenant_id
    FROM public.agent_budgets b
    JOIN public.agents a ON a.id = b.agent_id
    WHERE b.agent_id = NEW.agent_id
    ON CONFLICT DO NOTHING;

  ELSIF v_old_status IS DISTINCT FROM 'exceeded' AND v_new_status = 'exceeded' THEN
    INSERT INTO public.notifications (type, title, body, entity_type, entity_id, actor_type, meta, tenant_id)
    SELECT 'budget.exceeded',
           'Agent ' || a.name || ' exceeded monthly budget',
           'Stopped at $' || round(b.current_period_spend_usd, 2)::text
             || ' (limit $' || b.monthly_limit_usd::text || ')',
           'agent_budget', b.agent_id, 'system',
           jsonb_build_object(
             'agent_id', b.agent_id,
             'period_start', b.current_period_start::text,
             'spend', b.current_period_spend_usd,
             'limit', b.monthly_limit_usd
           ),
           v_tenant_id
    FROM public.agent_budgets b
    JOIN public.agents a ON a.id = b.agent_id
    WHERE b.agent_id = NEW.agent_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ── spawn_due_task_instances: propagate tenant_id in spawned tasks + audit ──

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
    SELECT * FROM public.task_series
    WHERE NOT is_paused
      AND next_occurrence_at IS NOT NULL
      AND next_occurrence_at <= now()
      AND (ends_on IS NULL OR (next_occurrence_at AT TIME ZONE timezone)::date <= ends_on)
      AND (ends_after_count IS NULL OR spawned_count < ends_after_count)
    FOR UPDATE SKIP LOCKED
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
      series_id, series_occurrence_at, due_at, due_date,
      tenant_id
    ) VALUES (
      v_series.stream_id, v_series.title, v_series.description, v_series.priority,
      v_series.assignee_type, v_series.assignee_agent_id, v_series.tags,
      v_series.linked_entity_type, v_series.linked_entity_id,
      v_series.id, v_occurrence_at, v_occurrence_at, v_occurrence_at,
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

-- ── complete_setup: accept + propagate tenant_id ───────────────────

CREATE OR REPLACE FUNCTION complete_setup(
  p_name text,
  p_slug text,
  p_description text,
  p_owner_name text,
  p_preferred_name text,
  p_timezone text,
  p_stages jsonb,
  p_fields jsonb,
  p_streams jsonb,
  p_tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.workspace SET
    name = p_name,
    slug = p_slug,
    description = nullif(p_description, ''),
    owner_name = nullif(p_owner_name, ''),
    owner_preferred_name = nullif(p_preferred_name, ''),
    owner_timezone = nullif(p_timezone, ''),
    initialized = true,
    updated_at = now()
  WHERE initialized = false AND tenant_id = p_tenant_id;

  DELETE FROM public.pipeline_stages WHERE entity_type = 'contact' AND tenant_id = p_tenant_id;
  DELETE FROM public.field_definitions WHERE entity_type = 'contact' AND tenant_id = p_tenant_id;
  DELETE FROM public.streams WHERE tenant_id = p_tenant_id;

  INSERT INTO public.pipeline_stages (entity_type, stage_key, label, color, sort_order, is_terminal, is_default, tenant_id)
  SELECT
    'contact',
    s->>'stage_key',
    s->>'label',
    s->>'color',
    coalesce((s->>'sort_order')::int, 0),
    coalesce((s->>'is_terminal')::bool, false),
    coalesce((s->>'is_default')::bool, false),
    p_tenant_id
  FROM jsonb_array_elements(p_stages) AS s;

  INSERT INTO public.field_definitions (entity_type, field_key, field_type, label, field_group, sort_order, required, options, description, is_active, tenant_id)
  SELECT
    'contact',
    f->>'field_key',
    f->>'field_type',
    f->>'label',
    f->>'field_group',
    coalesce((f->>'sort_order')::int, 0),
    coalesce((f->>'required')::bool, false),
    CASE WHEN f->'options' IS NOT NULL AND f->>'options' != 'null'
         THEN f->'options'
         ELSE NULL END,
    nullif(f->>'description', ''),
    true,
    p_tenant_id
  FROM jsonb_array_elements(p_fields) AS f;

  INSERT INTO public.streams (name, description, type, color, icon, sort_order, meta, tenant_id)
  SELECT
    st->>'name',
    nullif(st->>'description', ''),
    coalesce((st->>'type')::public.stream_type, 'functional'),
    st->>'color',
    st->>'icon',
    coalesce((st->>'sort_order')::int, 0),
    '{}'::jsonb,
    p_tenant_id
  FROM jsonb_array_elements(p_streams) AS st;
END;
$$;

-- ── recompute_agent_budget: tenant-aware workspace lookup ──────────

CREATE OR REPLACE FUNCTION recompute_agent_budget(p_agent_id uuid)
RETURNS agent_budgets LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_anchor_tz  text;
  v_period     date;
  v_result     public.agent_budgets;
  v_tenant_id  uuid;
BEGIN
  SELECT tenant_id, period_anchor_tz INTO v_tenant_id, v_anchor_tz
    FROM public.agent_budgets WHERE agent_id = p_agent_id;
  IF v_anchor_tz IS NULL THEN
    SELECT coalesce(nullif(owner_timezone, ''), 'UTC') INTO v_anchor_tz
      FROM public.workspace WHERE tenant_id = COALESCE(v_tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) LIMIT 1;
  END IF;
  v_period := date_trunc('month', now() AT TIME ZONE v_anchor_tz)::date;

  WITH agg AS (
    SELECT
      coalesce(SUM(cost_total_usd), 0)                           AS spend,
      coalesce(SUM(total_tokens), 0)                             AS tokens,
      count(*) FILTER (WHERE cost_total_usd IS NOT NULL)         AS metered,
      count(*) FILTER (WHERE cost_total_usd IS NULL)             AS unmetered,
      max(occurred_at)                                           AS last_at
    FROM public.agent_usage
    WHERE agent_id = p_agent_id
      AND occurred_at AT TIME ZONE v_anchor_tz >= v_period
  )
  UPDATE public.agent_budgets b SET
    current_period_start           = v_period,
    current_period_spend_usd       = agg.spend,
    current_period_tokens          = agg.tokens,
    current_period_metered_calls   = agg.metered,
    current_period_unmetered_calls = agg.unmetered,
    last_usage_at                  = agg.last_at,
    status =
      CASE
        WHEN b.monthly_limit_usd IS NULL THEN 'ok'
        WHEN agg.metered = 0 AND agg.unmetered > 0 THEN 'unmetered'
        WHEN agg.spend >= b.monthly_limit_usd THEN 'exceeded'
        WHEN agg.spend >= b.monthly_limit_usd * b.soft_threshold_pct / 100.0 THEN 'warned'
        ELSE 'ok'
      END,
    warned_at   = CASE WHEN agg.spend < coalesce(b.monthly_limit_usd, 'Infinity'::numeric)
                                       * b.soft_threshold_pct / 100.0
                       THEN NULL ELSE b.warned_at END,
    exceeded_at = CASE WHEN agg.spend < coalesce(b.monthly_limit_usd, 'Infinity'::numeric)
                       THEN NULL ELSE b.exceeded_at END
  FROM agg
  WHERE b.agent_id = p_agent_id
  RETURNING b.* INTO v_result;

  RETURN v_result;
END;
$$;
