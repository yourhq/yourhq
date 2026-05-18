-- 008_agents.sql — Agent registry and org-chart hierarchy.

CREATE TABLE IF NOT EXISTS agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  gateway_id        uuid REFERENCES gateways(id) ON DELETE SET NULL,
  name              text NOT NULL,
  slug              text NOT NULL,
  description       text,
  avatar_url        text,
  status            agent_status NOT NULL DEFAULT 'ready',
  last_seen_at      timestamptz,
  last_heartbeat_at timestamptz,
  model             text,
  thinking          text,
  reports_to_id     uuid REFERENCES agents(id) ON DELETE SET NULL,
  domains           text[] NOT NULL DEFAULT '{}',
  capabilities      text[],
  config            jsonb NOT NULL DEFAULT '{}',
  meta              jsonb NOT NULL DEFAULT '{}',
  UNIQUE (tenant_id, slug),
  CONSTRAINT agents_no_self_report CHECK (reports_to_id IS NULL OR reports_to_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agents_gateway ON agents(gateway_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_domains ON agents USING gin(domains);
CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents(reports_to_id);

DROP TRIGGER IF EXISTS agents_updated_at ON agents;
CREATE TRIGGER agents_updated_at
  BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON agents;
CREATE POLICY "Tenant isolation" ON agents
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON agents;
CREATE POLICY "Service role full access" ON agents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON agents TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE agents;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE agents REPLICA IDENTITY FULL;

-- ── Org-chart hierarchy RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION agent_reports_chain(p_agent_id uuid, p_max_depth int DEFAULT 5)
RETURNS TABLE (depth int, agent_id uuid, slug text, name text)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE chain AS (
    SELECT 0 AS depth, a.id AS agent_id, a.slug, a.name, a.reports_to_id
    FROM agents a WHERE a.id = p_agent_id AND a.tenant_id = current_tenant_id()
    UNION ALL
    SELECT c.depth + 1, a.id, a.slug, a.name, a.reports_to_id
    FROM chain c
    JOIN agents a ON a.id = c.reports_to_id AND a.tenant_id = current_tenant_id()
    WHERE c.depth < p_max_depth AND c.reports_to_id IS NOT NULL
  )
  SELECT chain.depth, chain.agent_id, chain.slug, chain.name FROM chain;
$$;

GRANT EXECUTE ON FUNCTION agent_reports_chain(uuid, int) TO authenticated, service_role;
