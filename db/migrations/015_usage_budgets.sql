-- 015_usage_budgets.sql — LLM usage logging, per-agent budgets, and enforcement.

-- ── Enum ────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE budget_status AS ENUM ('ok', 'warned', 'exceeded', 'unmetered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Workspace budget defaults ───────────────────────────────────

ALTER TABLE workspace ADD COLUMN IF NOT EXISTS default_agent_budget_usd numeric(10,2);
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS default_soft_threshold_pct integer NOT NULL DEFAULT 80;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS default_hard_cutoff boolean NOT NULL DEFAULT true;

-- ── agent_usage (source of truth) ───────────────────────────────

CREATE TABLE IF NOT EXISTS agent_usage (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                 uuid REFERENCES agents(id) ON DELETE SET NULL,
  agent_slug_snapshot      text,
  gateway_id               uuid REFERENCES gateways(id) ON DELETE SET NULL,
  session_id               text,
  run_id                   text NOT NULL,
  provider                 text NOT NULL,
  model                    text NOT NULL,
  input_tokens             integer NOT NULL DEFAULT 0,
  output_tokens            integer NOT NULL DEFAULT 0,
  cache_read               integer NOT NULL DEFAULT 0,
  cache_write              integer NOT NULL DEFAULT 0,
  total_tokens             integer NOT NULL DEFAULT 0,
  cost_input_usd           numeric(12,6),
  cost_output_usd          numeric(12,6),
  cost_cache_read_usd      numeric(12,6),
  cost_cache_write_usd     numeric(12,6),
  cost_total_usd           numeric(12,6),
  occurred_at              timestamptz NOT NULL DEFAULT now(),
  meta                     jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT agent_usage_idem UNIQUE (run_id, provider, model, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_occurred
  ON agent_usage(agent_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_usage_occurred
  ON agent_usage(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_model
  ON agent_usage(agent_id, model);

-- ── agent_budgets (rollup cache + budget config) ────────────────

CREATE TABLE IF NOT EXISTS agent_budgets (
  agent_id                       uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  monthly_limit_usd              numeric(10,2),
  soft_threshold_pct             integer NOT NULL DEFAULT 80,
  hard_cutoff                    boolean NOT NULL DEFAULT true,
  period_anchor_tz               text NOT NULL DEFAULT 'UTC',
  current_period_start           date NOT NULL DEFAULT CURRENT_DATE,
  current_period_spend_usd       numeric(12,6) NOT NULL DEFAULT 0,
  current_period_tokens          bigint NOT NULL DEFAULT 0,
  current_period_metered_calls   integer NOT NULL DEFAULT 0,
  current_period_unmetered_calls integer NOT NULL DEFAULT 0,
  status                         budget_status NOT NULL DEFAULT 'ok',
  warned_at                      timestamptz,
  exceeded_at                    timestamptz,
  last_usage_at                  timestamptz,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  meta                           jsonb NOT NULL DEFAULT '{}'
);

DROP TRIGGER IF EXISTS agent_budgets_updated_at ON agent_budgets;
CREATE TRIGGER agent_budgets_updated_at
  BEFORE UPDATE ON agent_budgets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Rollup trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_agent_budget_on_usage()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_anchor_tz   text;
  v_default_lim numeric(10,2);
  v_default_pct integer;
  v_default_cut boolean;
  v_period      date;
  v_old_status  public.budget_status;
  v_new_status  public.budget_status;
BEGIN
  IF NEW.agent_id IS NULL THEN RETURN NEW; END IF;

  SELECT
    default_agent_budget_usd,
    coalesce(default_soft_threshold_pct, 80),
    coalesce(default_hard_cutoff, true),
    coalesce(nullif(owner_timezone, ''), 'UTC')
  INTO v_default_lim, v_default_pct, v_default_cut, v_anchor_tz
  FROM public.workspace LIMIT 1;

  INSERT INTO public.agent_budgets (
    agent_id, monthly_limit_usd, soft_threshold_pct, hard_cutoff,
    period_anchor_tz, current_period_start
  ) VALUES (
    NEW.agent_id, v_default_lim, v_default_pct, v_default_cut,
    v_anchor_tz,
    date_trunc('month', NEW.occurred_at AT TIME ZONE v_anchor_tz)::date
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
    INSERT INTO public.notifications (type, title, body, entity_type, entity_id, actor_type, meta)
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
           )
    FROM public.agent_budgets b
    JOIN public.agents a ON a.id = b.agent_id
    WHERE b.agent_id = NEW.agent_id
    ON CONFLICT DO NOTHING;

  ELSIF v_old_status IS DISTINCT FROM 'exceeded' AND v_new_status = 'exceeded' THEN
    INSERT INTO public.notifications (type, title, body, entity_type, entity_id, actor_type, meta)
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
           )
    FROM public.agent_budgets b
    JOIN public.agents a ON a.id = b.agent_id
    WHERE b.agent_id = NEW.agent_id
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_usage_rollup ON agent_usage;
CREATE TRIGGER agent_usage_rollup
  AFTER INSERT ON agent_usage
  FOR EACH ROW EXECUTE FUNCTION update_agent_budget_on_usage();

-- ── Notification dedup index ────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_notification_per_period
  ON notifications (entity_id, type, (meta->>'period_start'))
  WHERE entity_type = 'agent_budget'
    AND type IN ('budget.warned', 'budget.exceeded');

-- ── Reconcile RPC ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recompute_agent_budget(p_agent_id uuid)
RETURNS public.agent_budgets LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_anchor_tz text;
  v_period    date;
  v_result    public.agent_budgets;
BEGIN
  SELECT period_anchor_tz INTO v_anchor_tz
    FROM public.agent_budgets WHERE agent_id = p_agent_id;
  IF v_anchor_tz IS NULL THEN
    SELECT coalesce(nullif(owner_timezone, ''), 'UTC') INTO v_anchor_tz
      FROM public.workspace LIMIT 1;
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

-- ── RLS ─────────────────────────────────────────────────────────

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['agent_usage', 'agent_budgets']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON %I', _tbl);
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      _tbl
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_usage TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_budgets TO authenticated, service_role;

-- ── Realtime (agent_budgets only — agent_usage is too frequent) ─

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY['agent_budgets']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', _tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', _tbl);
  END LOOP;
END
$$;

-- ── Backfill existing agents ────────────────────────────────────

INSERT INTO agent_budgets (agent_id)
SELECT id FROM agents
ON CONFLICT DO NOTHING;
