-- 014_agent_commands.sql — Command queue for agent lifecycle and system operations.

DO $$ BEGIN
  CREATE TYPE command_action AS ENUM (
    'provision', 'approve_pairing', 'update', 'remove',
    'restart_gateway', 'update_all', 'restart_dispatcher'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'auth_set_api_key';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'auth_start';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'auth_paste';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'auth_list';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'auth_remove';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'auth_refresh';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'auth_set_default';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'update_gateway';

DO $$ BEGIN
  CREATE TYPE command_status AS ENUM (
    'pending', 'leased', 'running', 'done', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agent_commands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  gateway_id      uuid REFERENCES gateways(id),
  agent_id        uuid REFERENCES agents(id) ON DELETE SET NULL,
  agent_slug      text,
  action          command_action NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  status          command_status NOT NULL DEFAULT 'pending',
  leased_at       timestamptz,
  leased_until    timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  failed_at       timestamptz,
  exit_code       integer,
  stdout          text,
  stderr          text,
  error_message   text,
  requested_by    uuid
);

-- Column reconciliation for agent_commands
ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS agent_slug text;
ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS exit_code integer;
ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS stdout text;
ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS stderr text;
ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS requested_by uuid;
ALTER TABLE agent_commands ADD COLUMN IF NOT EXISTS gateway_id uuid REFERENCES gateways(id);

-- Backfill gateway_id from the agent record (or the default gateway if no agent)
UPDATE agent_commands c
SET gateway_id = COALESCE(
  (SELECT a.gateway_id FROM agents a WHERE a.id = c.agent_id),
  (SELECT id FROM gateways WHERE slug = 'default')
)
WHERE c.gateway_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_commands_status ON agent_commands(status);
CREATE INDEX IF NOT EXISTS idx_commands_pending ON agent_commands(status, created_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_commands_agent ON agent_commands(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_gateway_pending ON agent_commands(gateway_id, status, created_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_commands_leased ON agent_commands(leased_until) WHERE status = 'leased';
CREATE INDEX IF NOT EXISTS idx_commands_created ON agent_commands(created_at DESC);

DROP TRIGGER IF EXISTS agent_commands_updated_at ON agent_commands;
CREATE TRIGGER agent_commands_updated_at
  BEFORE UPDATE ON agent_commands FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lease next pending command (atomic, row-locked).
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

-- Mark command as running
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

-- Complete a command
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

-- Fail a command
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
    status = 'failed', failed_at = now(),
    exit_code = p_exit_code, stdout = p_stdout, stderr = p_stderr,
    error_message = p_error, updated_at = now()
  WHERE id = p_command_id;
END;
$$;
