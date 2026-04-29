-- 005_crm.sql — Tags, campaigns, contacts, organizations, templates.

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  color       text DEFAULT '#6b7280',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  description text,
  channel     text,
  is_active   boolean NOT NULL DEFAULT true,
  meta        jsonb NOT NULL DEFAULT '{}'
);

DROP TRIGGER IF EXISTS campaigns_updated_at ON campaigns;
CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Column reconciliation for contacts (existing DBs may be missing newer columns)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS handle text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS relationship_strength text DEFAULT 'stranger';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contact_date timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS extended jsonb NOT NULL DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS how_we_met text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS twitter_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS website_url text;

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_priority ON contacts(priority);
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_contacts_extended ON contacts USING gin(extended);
CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(last_contact_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_contacts_relationship ON contacts(relationship_strength);
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_archived ON contacts(archived_at DESC) WHERE archived_at IS NOT NULL;

DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Column reconciliation for organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS extended jsonb NOT NULL DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text;

CREATE INDEX IF NOT EXISTS idx_orgs_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_orgs_tags ON organizations USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_orgs_extended ON organizations USING gin(extended);
CREATE INDEX IF NOT EXISTS idx_orgs_active ON organizations(created_at DESC) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contact ↔ Organization junction
CREATE TABLE IF NOT EXISTS contact_organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  contact_id  uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        text,
  is_current  boolean DEFAULT true,
  started_at  date,
  ended_at    date,
  UNIQUE(contact_id, org_id, role)
);

CREATE INDEX IF NOT EXISTS idx_contact_orgs_contact ON contact_organizations(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_orgs_org ON contact_organizations(org_id);
CREATE INDEX IF NOT EXISTS idx_contact_orgs_current ON contact_organizations(is_current) WHERE is_current = true;

-- Templates
CREATE TABLE IF NOT EXISTS templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Column reconciliation for templates
ALTER TABLE templates ADD COLUMN IF NOT EXISTS family text;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS angle text;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS audience text;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS overlays jsonb NOT NULL DEFAULT '[]';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_templates_family ON templates(family);
CREATE INDEX IF NOT EXISTS idx_templates_active ON templates(is_active) WHERE is_active = true;

DROP TRIGGER IF EXISTS templates_updated_at ON templates;
CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
