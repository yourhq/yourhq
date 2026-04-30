-- 022_agent_heartbeat_cron.sql — Per-agent heartbeat scheduling via pg_cron.
--
-- Adds a heartbeat_cron column to agents (nullable cron expression).
-- A pg_cron job runs every minute, calling spawn_agent_heartbeats()
-- which checks each agent's schedule and inserts inbox items when due.

-- ── Add heartbeat_cron column ─────────────────────────────────────────

ALTER TABLE agents ADD COLUMN IF NOT EXISTS heartbeat_cron text;

-- ── spawn_agent_heartbeats() ──────────────────────────────────────────
-- Called every minute by pg_cron. For each agent with a configured
-- heartbeat_cron that is in 'ready' status, checks whether enough time
-- has passed since last_heartbeat_at and inserts a heartbeat inbox item.
--
-- Cron interval mapping (we only support presets):
--   */15 * * * *  → 15 minutes
--   */30 * * * *  → 30 minutes
--   0 * * * *     → 60 minutes
--   0 */6 * * *   → 360 minutes
--   0 9 * * *     → 1440 minutes (daily)

CREATE OR REPLACE FUNCTION spawn_agent_heartbeats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_agent RECORD;
  v_interval_minutes integer;
  v_dedup_key text;
  v_period text;
BEGIN
  FOR v_agent IN
    SELECT id, slug, tenant_id, heartbeat_cron, last_heartbeat_at
    FROM public.agents
    WHERE heartbeat_cron IS NOT NULL
      AND status = 'ready'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_interval_minutes := CASE v_agent.heartbeat_cron
      WHEN '*/15 * * * *' THEN 15
      WHEN '*/30 * * * *' THEN 30
      WHEN '0 * * * *'    THEN 60
      WHEN '0 */6 * * *'  THEN 360
      WHEN '0 9 * * *'    THEN 1440
      ELSE NULL
    END;

    IF v_interval_minutes IS NULL THEN
      CONTINUE;
    END IF;

    IF v_agent.last_heartbeat_at IS NOT NULL
       AND v_agent.last_heartbeat_at + (v_interval_minutes || ' minutes')::interval > now()
    THEN
      CONTINUE;
    END IF;

    v_period := to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    v_dedup_key := 'heartbeat:' || v_agent.id || ':' || v_period;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type, summary, dedup_key, context, tenant_id
    ) VALUES (
      v_agent.id,
      v_agent.slug,
      'heartbeat',
      'Scheduled heartbeat',
      v_dedup_key,
      jsonb_build_object(
        'heartbeat_cron', v_agent.heartbeat_cron,
        'interval_minutes', v_interval_minutes
      ),
      v_agent.tenant_id
    ) ON CONFLICT (dedup_key) DO NOTHING;

    UPDATE public.agents
    SET last_heartbeat_at = now()
    WHERE id = v_agent.id;
  END LOOP;
END;
$$;

-- ── Schedule pg_cron job (runs every minute) ──────────────────────────
-- pg_cron must be enabled in the Supabase project (Extensions → pg_cron).
-- If pg_cron is not available this block is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('spawn_agent_heartbeats');
    PERFORM cron.schedule(
      'spawn_agent_heartbeats',
      '* * * * *',
      'SELECT spawn_agent_heartbeats()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — heartbeat scheduling skipped. Enable the pg_cron extension and re-run this migration.';
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION spawn_agent_heartbeats() TO authenticated, service_role;

-- ── Schema version ────────────────────────────────────────────────────

INSERT INTO _schema_version (version, description)
VALUES (22, 'Per-agent heartbeat scheduling via pg_cron')
ON CONFLICT (version) DO NOTHING;
