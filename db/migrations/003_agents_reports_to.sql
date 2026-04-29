-- 003: Agent org-chart hierarchy (reports_to_id)
-- Idempotent — safe to re-run.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS reports_to_id uuid REFERENCES agents(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE agents
    ADD CONSTRAINT agents_no_self_report CHECK (reports_to_id IS NULL OR reports_to_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents(reports_to_id);

-- Recursive CTE: walk the chain from a given agent up to its root.
-- Used by the UI for cycle detection before saving a manager change.
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
