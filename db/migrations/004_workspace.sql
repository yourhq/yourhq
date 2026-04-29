-- 004_workspace.sql — Workspace settings, pipeline stages, custom field definitions.

-- Workspace settings (single row)
CREATE TABLE IF NOT EXISTS workspace (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  name                  text NOT NULL DEFAULT 'HQ',
  slug                  text,
  description           text,
  initialized           boolean NOT NULL DEFAULT false,
  owner_name            text,
  owner_preferred_name  text,
  owner_timezone        text,
  settings              jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for workspace
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS initialized boolean NOT NULL DEFAULT false;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS owner_preferred_name text;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS owner_timezone text;
ALTER TABLE workspace ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

-- Singleton constraint: only one workspace row can ever exist
CREATE UNIQUE INDEX IF NOT EXISTS workspace_singleton ON workspace ((true));
CREATE UNIQUE INDEX IF NOT EXISTS workspace_slug_unique ON workspace (slug) WHERE slug IS NOT NULL;

DROP TRIGGER IF EXISTS workspace_updated_at ON workspace;
CREATE TRIGGER workspace_updated_at
  BEFORE UPDATE ON workspace FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pipeline stage definitions
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  entity_type text NOT NULL DEFAULT 'contact',
  stage_key   text NOT NULL,
  label       text NOT NULL,
  color       text,
  sort_order  integer DEFAULT 0,
  is_terminal boolean DEFAULT false,
  is_default  boolean DEFAULT false,
  UNIQUE(entity_type, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_entity ON pipeline_stages(entity_type, sort_order);

-- Custom field definitions
CREATE TABLE IF NOT EXISTS field_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  UNIQUE(entity_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_field_definitions_entity ON field_definitions(entity_type, is_active);

-- Seed: initial workspace row (singleton)
INSERT INTO workspace (name, initialized)
SELECT 'HQ', false
WHERE NOT EXISTS (SELECT 1 FROM workspace);
