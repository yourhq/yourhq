-- 007_agents.sql — Agent registry and org-chart hierarchy.

CREATE TABLE IF NOT EXISTS agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  gateway_id    uuid REFERENCES gateways(id),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  description   text,
  avatar_url    text,
  status        agent_status NOT NULL DEFAULT 'offline',
  last_seen_at  timestamptz,
  domains       text[] NOT NULL DEFAULT '{}',
  capabilities  text[],
  config        jsonb NOT NULL DEFAULT '{}',
  meta          jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS domains text[] NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS capabilities text[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS gateway_id uuid REFERENCES gateways(id);

-- Backfill existing agents to the default gateway.
UPDATE agents
SET gateway_id = (SELECT id FROM gateways WHERE slug = 'default')
WHERE gateway_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_gateway ON agents(gateway_id);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_domains ON agents USING gin(domains);

DROP TRIGGER IF EXISTS agents_updated_at ON agents;
CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Org-chart hierarchy ─────────────────────────────────────────

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS reports_to_id uuid REFERENCES agents(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE agents
    ADD CONSTRAINT agents_no_self_report CHECK (reports_to_id IS NULL OR reports_to_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents(reports_to_id);

CREATE OR REPLACE FUNCTION agent_reports_chain(p_agent_id uuid, p_max_depth int DEFAULT 5)
RETURNS TABLE (depth int, agent_id uuid, slug text, name text)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain AS (
    SELECT 0 AS depth, a.id AS agent_id, a.slug, a.name, a.reports_to_id
    FROM agents a WHERE a.id = p_agent_id
    UNION ALL
    SELECT c.depth + 1, a.id, a.slug, a.name, a.reports_to_id
    FROM chain c
    JOIN agents a ON a.id = c.reports_to_id
    WHERE c.depth < p_max_depth AND c.reports_to_id IS NOT NULL
  )
  SELECT chain.depth, chain.agent_id, chain.slug, chain.name FROM chain;
$$;

GRANT EXECUTE ON FUNCTION agent_reports_chain(uuid, int) TO authenticated, service_role;
