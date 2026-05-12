-- 005_workspace.sql — Workspace settings, pipeline stages, custom field definitions.

-- ── Workspace settings (singleton per tenant) ─────────────────────

CREATE TABLE IF NOT EXISTS workspace (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  name                        text NOT NULL DEFAULT 'HQ',
  slug                        text,
  description                 text,
  initialized                 boolean NOT NULL DEFAULT false,
  owner_name                  text,
  owner_preferred_name        text,
  owner_timezone              text,
  settings                    jsonb NOT NULL DEFAULT '{}',
  default_agent_budget_usd    numeric(10,2),
  default_soft_threshold_pct  integer NOT NULL DEFAULT 80,
  default_hard_cutoff         boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_tenant_singleton ON workspace(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_slug_tenant_unique ON workspace(tenant_id, slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_tenant ON workspace(tenant_id);

DROP TRIGGER IF EXISTS workspace_updated_at ON workspace;
CREATE TRIGGER workspace_updated_at
  BEFORE UPDATE ON workspace FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE workspace ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON workspace;
CREATE POLICY "Tenant isolation" ON workspace
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON workspace;
CREATE POLICY "Service role full access" ON workspace
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON workspace TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE workspace;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE workspace REPLICA IDENTITY FULL;

-- Seed: initial workspace row (singleton for default tenant)
INSERT INTO workspace (name, initialized)
SELECT 'HQ', false
WHERE NOT EXISTS (SELECT 1 FROM workspace);

-- ── Pipeline stage definitions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  entity_type text NOT NULL DEFAULT 'contact',
  stage_key   text NOT NULL,
  label       text NOT NULL,
  color       text,
  sort_order  integer DEFAULT 0,
  is_terminal boolean DEFAULT false,
  is_default  boolean DEFAULT false,
  UNIQUE (tenant_id, entity_type, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_entity ON pipeline_stages(entity_type, sort_order);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant ON pipeline_stages(tenant_id);

-- RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON pipeline_stages;
CREATE POLICY "Tenant isolation" ON pipeline_stages
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON pipeline_stages;
CREATE POLICY "Service role full access" ON pipeline_stages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON pipeline_stages TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_stages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE pipeline_stages REPLICA IDENTITY FULL;

-- ── Custom field definitions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS field_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  entity_type text NOT NULL DEFAULT 'contact',
  field_key   text NOT NULL,
  field_type  text NOT NULL,
  label       text NOT NULL,
  field_group text,
  sort_order  integer DEFAULT 0,
  required    boolean DEFAULT false,
  options     jsonb,
  description text,
  is_active   boolean DEFAULT true,
  UNIQUE (tenant_id, entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_field_definitions_entity ON field_definitions(entity_type, is_active);
CREATE INDEX IF NOT EXISTS idx_field_definitions_tenant ON field_definitions(tenant_id);

-- RLS
ALTER TABLE field_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON field_definitions;
CREATE POLICY "Tenant isolation" ON field_definitions
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON field_definitions;
CREATE POLICY "Service role full access" ON field_definitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON field_definitions TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE field_definitions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE field_definitions REPLICA IDENTITY FULL;
