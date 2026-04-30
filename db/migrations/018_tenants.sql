-- 018_tenants.sql — Tenants table + tenant_id on all existing tables.
--
-- OSS: single default tenant, trivially satisfied.
-- Paid hosted: one tenant per Supabase project, also trivial.
-- Free hosted (v1.1): shared Supabase, many tenants, RLS via tenant_id.

-- ── Tenants table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  slug        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  meta        jsonb NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique ON tenants(slug);

DROP TRIGGER IF EXISTS tenants_updated_at ON tenants;
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed the default tenant for OSS / single-tenant deployments.
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default', 'default')
ON CONFLICT (id) DO NOTHING;

-- ── Add tenant_id to every existing table ──────────────────────────
-- Uses a fixed default so existing rows get the default tenant.

DO $$
DECLARE
  _tbl text;
  _default_tid uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'workspace', 'pipeline_stages', 'field_definitions',
    'tags', 'campaigns', 'contacts', 'organizations', 'contact_organizations',
    'templates', 'interactions', 'draft_sets',
    'gateways', 'gateway_registration_tokens',
    'agents',
    'streams', 'tasks', 'task_series',
    'comments', 'task_attachments',
    'asset_folders', 'assets', 'document_folders', 'documents',
    'audit_log', 'notifications',
    'agent_inbox_items', 'automation_rules',
    'agent_commands',
    'agent_usage', 'agent_budgets'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT %L REFERENCES tenants(id) ON DELETE CASCADE',
      _tbl, _default_tid
    );
  END LOOP;
END
$$;

-- ── Create indexes on tenant_id ────────────────────────────────────

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'workspace', 'pipeline_stages', 'field_definitions',
    'tags', 'campaigns', 'contacts', 'organizations', 'contact_organizations',
    'templates', 'interactions', 'draft_sets',
    'gateways', 'gateway_registration_tokens',
    'agents',
    'streams', 'tasks', 'task_series',
    'comments', 'task_attachments',
    'asset_folders', 'assets', 'document_folders', 'documents',
    'audit_log', 'notifications',
    'agent_inbox_items', 'automation_rules',
    'agent_commands',
    'agent_usage', 'agent_budgets'
  ]
  LOOP
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tenant ON %I(tenant_id)',
      _tbl, _tbl
    );
  END LOOP;
END
$$;

-- ── Migrate unique constraints to be tenant-scoped ─────────────────

-- workspace: replace singleton constraint with per-tenant singleton
DROP INDEX IF EXISTS workspace_singleton;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_tenant_singleton ON workspace(tenant_id);

-- workspace slug: tenant-scoped
DROP INDEX IF EXISTS workspace_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_slug_tenant_unique ON workspace(tenant_id, slug) WHERE slug IS NOT NULL;

-- pipeline_stages: tenant-scoped
ALTER TABLE pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_entity_type_stage_key_key;
DO $$ BEGIN
  ALTER TABLE pipeline_stages ADD CONSTRAINT pipeline_stages_tenant_entity_stage_key UNIQUE (tenant_id, entity_type, stage_key);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- field_definitions: tenant-scoped
ALTER TABLE field_definitions DROP CONSTRAINT IF EXISTS field_definitions_entity_type_field_key_key;
DO $$ BEGIN
  ALTER TABLE field_definitions ADD CONSTRAINT field_definitions_tenant_entity_field_key UNIQUE (tenant_id, entity_type, field_key);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- tags: tenant-scoped
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_name_key;
DO $$ BEGIN
  ALTER TABLE tags ADD CONSTRAINT tags_tenant_name UNIQUE (tenant_id, name);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- gateways: tenant-scoped slug
ALTER TABLE gateways DROP CONSTRAINT IF EXISTS gateways_slug_key;
DO $$ BEGIN
  ALTER TABLE gateways ADD CONSTRAINT gateways_tenant_slug UNIQUE (tenant_id, slug);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- gateway_registration_tokens: token_hash stays globally unique (tokens must be unique across all tenants)

-- agents: tenant-scoped slug
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_slug_key;
DO $$ BEGIN
  ALTER TABLE agents ADD CONSTRAINT agents_tenant_slug UNIQUE (tenant_id, slug);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- contact_organizations: tenant-scoped
ALTER TABLE contact_organizations DROP CONSTRAINT IF EXISTS contact_organizations_contact_id_org_id_role_key;
DO $$ BEGIN
  ALTER TABLE contact_organizations ADD CONSTRAINT contact_orgs_tenant_contact_org_role UNIQUE (tenant_id, contact_id, org_id, role);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- tasks: series occurrence uniqueness stays within series (series_id already scoped to tenant via FK)

-- agent_inbox_items: dedup_key stays globally unique (dedup keys are content-addressed)

-- agent_usage: idempotency stays globally unique

-- draft_sets: tenant-scoped
ALTER TABLE draft_sets DROP CONSTRAINT IF EXISTS draft_sets_contact_id_channel_stage_version_key;
DO $$ BEGIN
  ALTER TABLE draft_sets ADD CONSTRAINT draft_sets_tenant_contact_channel_stage_version UNIQUE (tenant_id, contact_id, channel, stage, version);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- ── Grants ─────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO authenticated, service_role;

-- ── Realtime ───────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tenants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE tenants REPLICA IDENTITY FULL;

-- ── RLS on tenants ─────────────────────────────────────────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON tenants;
CREATE POLICY "Authenticated full access" ON tenants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
