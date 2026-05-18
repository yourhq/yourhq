-- 006_crm.sql — Tags, campaigns, contacts, organizations, templates, draft sets.

-- ── Tags ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text DEFAULT '#6b7280',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_tenant ON tags(tenant_id);

-- RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON tags;
CREATE POLICY "Tenant isolation" ON tags
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON tags;
CREATE POLICY "Service role full access" ON tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON tags TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tags;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE tags REPLICA IDENTITY FULL;

-- ── Campaigns ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  description text,
  channel     text,
  is_active   boolean NOT NULL DEFAULT true,
  meta        jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);

DROP TRIGGER IF EXISTS campaigns_updated_at ON campaigns;
CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON campaigns;
CREATE POLICY "Tenant isolation" ON campaigns
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON campaigns;
CREATE POLICY "Service role full access" ON campaigns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON campaigns TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE campaigns REPLICA IDENTITY FULL;

-- ── Contacts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- Identity
  name                  text NOT NULL,
  email                 text,
  phone                 text,
  linkedin_url          text,
  twitter_url           text,
  website_url           text,
  company               text,
  title                 text,
  location              text,
  avatar_url            text,
  handle                text,

  -- Context
  how_we_met            text,
  notes                 text,
  tags                  text[] NOT NULL DEFAULT '{}',
  source                text,
  campaign_id           uuid REFERENCES campaigns(id) ON DELETE SET NULL,

  -- Pipeline
  status                text NOT NULL DEFAULT 'new',
  status_changed_at     timestamptz,
  priority              text,

  -- Relationship
  relationship_strength text DEFAULT 'stranger',
  last_contact_date     timestamptz,

  -- Workstream-specific (shaped by field_definitions)
  extended              jsonb NOT NULL DEFAULT '{}',

  -- Soft delete
  archived_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_extended ON contacts USING gin(extended);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(last_contact_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_contacts_relationship ON contacts(relationship_strength);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_status_active ON contacts(status, priority) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_archived ON contacts(archived_at DESC) WHERE archived_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_email_unique ON contacts(tenant_id, LOWER(email)) WHERE email IS NOT NULL;

DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON contacts;
CREATE POLICY "Tenant isolation" ON contacts
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON contacts;
CREATE POLICY "Service role full access" ON contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON contacts TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE contacts REPLICA IDENTITY FULL;

-- ── Organizations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  type        text,
  website     text,
  industry    text,
  size        text,
  location    text,
  description text,
  notes       text,
  tags        text[] NOT NULL DEFAULT '{}',
  status      text,
  extended    jsonb NOT NULL DEFAULT '{}',
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON organizations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orgs_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_orgs_tags ON organizations USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_orgs_extended ON organizations USING gin(extended);
CREATE INDEX IF NOT EXISTS idx_orgs_active ON organizations(created_at DESC) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON organizations;
CREATE POLICY "Tenant isolation" ON organizations
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON organizations;
CREATE POLICY "Service role full access" ON organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON organizations TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE organizations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE organizations REPLICA IDENTITY FULL;

-- ── Contact <-> Organization junction ─────────────────────────────

CREATE TABLE IF NOT EXISTS contact_organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        text,
  is_current  boolean NOT NULL DEFAULT true,
  started_at  date,
  ended_at    date,
  UNIQUE (tenant_id, contact_id, org_id, role),
  CHECK ((is_current = true AND ended_at IS NULL) OR (is_current = false))
);

CREATE INDEX IF NOT EXISTS idx_contact_organizations_tenant ON contact_organizations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_orgs_contact ON contact_organizations(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_orgs_org ON contact_organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_contact_orgs_current ON contact_organizations(is_current) WHERE is_current = true;

-- RLS
ALTER TABLE contact_organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON contact_organizations;
CREATE POLICY "Tenant isolation" ON contact_organizations
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON contact_organizations;
CREATE POLICY "Service role full access" ON contact_organizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON contact_organizations TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE contact_organizations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE contact_organizations REPLICA IDENTITY FULL;

-- ── Templates ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  channel     text,
  stage       text,
  subject     text,
  body        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  use_count   integer NOT NULL DEFAULT 0,
  family      text,
  angle       text,
  audience    text,
  overlays    jsonb NOT NULL DEFAULT '[]',
  meta        jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_templates_family ON templates(family);
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates(is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS templates_updated_at ON templates;
CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON templates;
CREATE POLICY "Tenant isolation" ON templates
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON templates;
CREATE POLICY "Service role full access" ON templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON templates TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE templates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE templates REPLICA IDENTITY FULL;

-- ── Draft sets ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_sets (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  contact_id              uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_id             uuid REFERENCES templates(id) ON DELETE SET NULL,
  channel                 text NOT NULL,
  stage                   text NOT NULL,
  version                 integer NOT NULL DEFAULT 1,
  variants                jsonb NOT NULL,
  selected_variant_index  integer,
  based_on_draft_set_id   uuid REFERENCES draft_sets(id) ON DELETE SET NULL,
  feedback_notes          text,
  status                  text NOT NULL DEFAULT 'draft',
  meta                    jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT draft_sets_version_check CHECK (version >= 1),
  CONSTRAINT draft_sets_variants_is_array CHECK (jsonb_typeof(variants) = 'array'),
  UNIQUE (tenant_id, contact_id, channel, stage, version)
);

CREATE INDEX IF NOT EXISTS idx_draft_sets_tenant ON draft_sets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_draft_sets_contact ON draft_sets(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_sets_status ON draft_sets(status);

DROP TRIGGER IF EXISTS draft_sets_updated_at ON draft_sets;
CREATE TRIGGER draft_sets_updated_at
  BEFORE UPDATE ON draft_sets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE draft_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation" ON draft_sets;
CREATE POLICY "Tenant isolation" ON draft_sets
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON draft_sets;
CREATE POLICY "Service role full access" ON draft_sets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grants
GRANT ALL ON draft_sets TO authenticated, service_role;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE draft_sets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE draft_sets REPLICA IDENTITY FULL;
