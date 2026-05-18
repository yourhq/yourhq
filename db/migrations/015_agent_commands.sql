-- 015_agent_commands.sql — Command queue for agent lifecycle and system operations.

CREATE TABLE IF NOT EXISTS agent_commands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,
  agent_slug      text,
  gateway_id      uuid REFERENCES gateways(id),
  action          command_action NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  status          command_status NOT NULL DEFAULT 'pending',
  leased_at       timestamptz,
  leased_until    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  exit_code       integer,
  stdout          text,
  stderr          text,
  error_message   text,
  requested_by    uuid,
  meta            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_commands_tenant ON agent_commands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON agent_commands(status);
CREATE INDEX IF NOT EXISTS idx_commands_pending ON agent_commands(status, created_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_commands_agent ON agent_commands(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_gateway_pending ON agent_commands(gateway_id, status, created_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_commands_leased ON agent_commands(leased_until) WHERE status = 'leased';
CREATE INDEX IF NOT EXISTS idx_commands_created ON agent_commands(created_at DESC);

DROP TRIGGER IF EXISTS agent_commands_updated_at ON agent_commands;
CREATE TRIGGER agent_commands_updated_at
  BEFORE UPDATE ON agent_commands FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE agent_commands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON agent_commands;
CREATE POLICY "Tenant isolation" ON agent_commands
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON agent_commands;
CREATE POLICY "Service role full access" ON agent_commands
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT ON agent_commands TO authenticated;
GRANT ALL ON agent_commands TO service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agent_commands;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE agent_commands REPLICA IDENTITY FULL;

-- ── Command lifecycle RPCs ────────────────────────────────────────

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

CREATE OR REPLACE FUNCTION start_command(p_command_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_commands
  SET status = 'running', started_at = now(), updated_at = now()
  WHERE id = p_command_id;
END;
$$;

CREATE OR REPLACE FUNCTION complete_command(
  p_command_id uuid,
  p_exit_code integer,
  p_stdout text DEFAULT NULL,
  p_stderr text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_commands
  SET
    status = 'done', completed_at = now(),
    exit_code = p_exit_code, stdout = p_stdout, stderr = p_stderr,
    updated_at = now()
  WHERE id = p_command_id;
END;
$$;

CREATE OR REPLACE FUNCTION fail_command(
  p_command_id uuid,
  p_exit_code integer DEFAULT NULL,
  p_stdout text DEFAULT NULL,
  p_stderr text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_commands
  SET
    status = 'failed', completed_at = now(),
    exit_code = p_exit_code, stdout = p_stdout, stderr = p_stderr,
    error_message = p_error, updated_at = now()
  WHERE id = p_command_id;
END;
$$;

-- ── Grants for RPCs ──────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION lease_command(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION start_command(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION complete_command(uuid, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fail_command(uuid, integer, text, text, text) TO authenticated, service_role;
