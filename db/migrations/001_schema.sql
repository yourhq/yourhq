-- ============================================================
-- HQ — Idempotent Schema Migration
-- Safe to run on both fresh and existing Supabase projects.
-- Uses IF NOT EXISTS / CREATE OR REPLACE throughout.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. EXTENSIONS
-- ════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ════════════════════════════════════════════════════════════════
-- 2. ENUMS
-- ════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'cancelled', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE stream_type AS ENUM ('functional', 'project', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE actor_type AS ENUM ('human', 'agent', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'created', 'updated', 'deleted', 'archived',
    'status_changed', 'assigned', 'commented',
    'uploaded', 'moved', 'restored'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('online', 'offline', 'error', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM (
    'document', 'sop', 'research', 'image', 'video', 'audio',
    'template', 'script', 'spreadsheet', 'link', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE inbox_item_status AS ENUM ('pending', 'leased', 'done', 'failed', 'dead_letter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE inbox_event_type AS ENUM (
    'task_assignment', 'task_reassignment', 'task_comment_mention',
    'contact_created', 'contact_status_changed', 'contact_updated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE automation_condition AS ENUM ('created', 'changed_to', 'changed_from', 'any_change');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════════════════════════════════════════════════════
-- 3. SHARED TRIGGER FUNCTION
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 4. CONFIGURATION TABLES
-- ════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════
-- 5. CRM TABLES
-- ════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════
-- 6. GATEWAYS
-- Each gateway is an OpenClaw host running the Docker stack. One workspace
-- can have multiple gateways (e.g., cloud VPS + local Mac mini); each agent
-- is bound to exactly one gateway.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gateways (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  slug          text NOT NULL UNIQUE,   -- e.g., 'default', 'eu', 'laptop'
  label         text NOT NULL,
  status        text NOT NULL DEFAULT 'offline',
  last_seen_at  timestamptz,
  meta          jsonb NOT NULL DEFAULT '{}'   -- reachable_urls, tailscale_ip, version, exit_node
);

CREATE INDEX IF NOT EXISTS idx_gateways_status ON gateways(status);

DROP TRIGGER IF EXISTS gateways_updated_at ON gateways;
CREATE TRIGGER gateways_updated_at
  BEFORE UPDATE ON gateways FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed a default gateway so single-gateway deployments Just Work.
INSERT INTO gateways (slug, label)
VALUES ('default', 'Primary gateway')
ON CONFLICT (slug) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
-- 7. AGENTS
-- ════════════════════════════════════════════════════════════════

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

-- ════════════════════════════════════════════════════════════════
-- 7. INTERACTIONS (replaces outreach_log)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE SET NULL,
  type            text NOT NULL,
  direction       text,
  channel         text,
  subject         text,
  summary         text,
  body            text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  next_action     text,
  next_action_date timestamptz,
  template_id     uuid REFERENCES templates(id) ON DELETE SET NULL,
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  meta            jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for interactions
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS next_action_date timestamptz;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS template_id uuid;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS actor_type actor_type NOT NULL DEFAULT 'human';
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS actor_agent_id uuid;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_occurred ON interactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);
CREATE INDEX IF NOT EXISTS idx_interactions_next_action ON interactions(next_action_date ASC NULLS LAST)
  WHERE next_action_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_actor ON interactions(actor_type, actor_agent_id);
CREATE INDEX IF NOT EXISTS idx_interactions_org ON interactions(org_id);

-- Trigger: sync contact last_contact_date on new interaction
CREATE OR REPLACE FUNCTION sync_contact_last_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.contacts
  SET last_contact_date = GREATEST(last_contact_date, NEW.occurred_at)
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interactions_sync_contact ON interactions;
CREATE TRIGGER interactions_sync_contact
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION sync_contact_last_interaction();

-- Trigger: increment template use_count
CREATE OR REPLACE FUNCTION increment_template_use()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.template_id IS NOT NULL THEN
    UPDATE public.templates
    SET use_count = use_count + 1
    WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interactions_template_use ON interactions;
CREATE TRIGGER interactions_template_use
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION increment_template_use();

-- ════════════════════════════════════════════════════════════════
-- 8. TASKS & STREAMS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS streams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  description text,
  color       text DEFAULT '#6b7280',
  icon        text,
  sort_order  integer DEFAULT 0,
  type        stream_type NOT NULL DEFAULT 'functional',
  is_archived boolean DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb
);

DROP TRIGGER IF EXISTS streams_updated_at ON streams;
CREATE TRIGGER streams_updated_at
  BEFORE UPDATE ON streams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  title                text NOT NULL,
  description          text,
  status               task_status NOT NULL DEFAULT 'todo',
  priority             task_priority,
  stream_id            uuid REFERENCES streams(id) ON DELETE SET NULL,
  parent_id            uuid REFERENCES tasks(id) ON DELETE CASCADE,
  assignee_type        actor_type,
  assignee_agent_id    uuid REFERENCES agents(id) ON DELETE SET NULL,
  due_date             timestamptz,
  due_at               timestamptz,
  completed_at         timestamptz,
  linked_entity_type   text,
  linked_entity_id     uuid,
  contact_id           uuid REFERENCES contacts(id) ON DELETE SET NULL,
  org_id               uuid REFERENCES organizations(id) ON DELETE SET NULL,
  series_id            uuid,  -- FK set after task_series is created
  series_occurrence_at timestamptz,
  is_recurring         boolean DEFAULT false,
  recurrence_rule      text,
  last_completed_at    timestamptz,
  tags                 text[] NOT NULL DEFAULT '{}',
  sort_order           integer DEFAULT 0,
  archived_at          timestamptz
);

-- Column reconciliation for streams
ALTER TABLE streams ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS type stream_type NOT NULL DEFAULT 'functional';
ALTER TABLE streams ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Column reconciliation for tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linked_entity_type text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS linked_entity_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS series_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS series_occurrence_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_rule text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_completed_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_type actor_type;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_stream ON tasks(stream_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tasks_active ON tasks(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tags ON tasks USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_tasks_series_history
  ON tasks(series_id, series_occurrence_at DESC) WHERE series_id IS NOT NULL;
-- Full (non-partial) unique constraint: required for ON CONFLICT
-- to match. Multiple non-recurring rows (both NULL) are fine because
-- Postgres treats NULLs as distinct in unique constraints.
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_series_occurrence_key UNIQUE (series_id, series_occurrence_at);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS tasks_updated_at ON tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-set completed_at
CREATE OR REPLACE FUNCTION sync_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD IS NULL OR OLD.status != 'done') THEN
    NEW.completed_at = now();
  ELSIF NEW.status != 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_completion ON tasks;
CREATE TRIGGER tasks_sync_completion
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION sync_task_completion();

-- ── Recurring tasks: task_series (definition) + spawn infra ─────

CREATE TABLE IF NOT EXISTS task_series (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  -- task template fields
  stream_id             uuid REFERENCES streams(id) ON DELETE SET NULL,
  title                 text NOT NULL,
  description           text,
  priority              task_priority NOT NULL DEFAULT 'medium',
  assignee_type         actor_type,
  assignee_agent_id     uuid REFERENCES agents(id) ON DELETE SET NULL,
  tags                  text[] NOT NULL DEFAULT '{}',
  linked_entity_type    text,
  linked_entity_id      uuid,
  meta                  jsonb NOT NULL DEFAULT '{}',

  -- cadence
  cadence_type          text NOT NULL
    CHECK (cadence_type IN ('daily','weekdays','weekly','monthly','every_n_days')),
  interval_n            integer NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
  days_of_week          smallint[] NOT NULL DEFAULT '{}',  -- 0=Sun..6=Sat
  day_of_month          smallint,                          -- 1..31 or -1 = last day
  time_of_day           time NOT NULL DEFAULT '09:00',
  timezone              text NOT NULL,

  -- lifecycle
  is_paused             boolean NOT NULL DEFAULT false,
  starts_on             date NOT NULL DEFAULT current_date,
  ends_on               date,
  ends_after_count      integer,
  spawned_count         integer NOT NULL DEFAULT 0,
  next_occurrence_at    timestamptz,
  last_spawned_at       timestamptz,
  missed_policy         text NOT NULL DEFAULT 'auto_skip'
    CHECK (missed_policy IN ('auto_skip','queue'))
);

CREATE INDEX IF NOT EXISTS idx_task_series_next_due
  ON task_series(next_occurrence_at) WHERE NOT is_paused;
CREATE INDEX IF NOT EXISTS idx_task_series_stream ON task_series(stream_id);
CREATE INDEX IF NOT EXISTS idx_task_series_assignee ON task_series(assignee_agent_id);

DROP TRIGGER IF EXISTS task_series_updated_at ON task_series;
CREATE TRIGGER task_series_updated_at
  BEFORE UPDATE ON task_series FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Attach the deferred FK from tasks.series_id → task_series.id
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_series_id_fkey FOREIGN KEY (series_id) REFERENCES task_series(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;

-- Compute next UTC occurrence from a "from" timestamp, per series cadence.
CREATE OR REPLACE FUNCTION next_occurrence(
  p_series task_series,
  p_from_ts timestamptz
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_tz             text := p_series.timezone;
  v_from_local     timestamp;
  v_local_date     date;
  v_candidate_local timestamp;
  v_candidate_utc  timestamptz;
  v_dow_local      int;
  v_dom            int;
  v_y              int;
  v_m              int;
  v_last_day       int;
  v_i              int;
BEGIN
  v_from_local := (p_from_ts AT TIME ZONE v_tz);
  v_local_date := v_from_local::date;

  IF p_series.cadence_type = 'daily' OR p_series.cadence_type = 'every_n_days' THEN
    v_candidate_local := (v_local_date::timestamp + p_series.time_of_day::interval);
    IF v_candidate_local <= v_from_local THEN
      v_candidate_local := ((v_local_date + (p_series.interval_n || ' days')::interval)::date::timestamp)
                         + p_series.time_of_day::interval;
    END IF;

  ELSIF p_series.cadence_type = 'weekdays' THEN
    v_candidate_local := (v_local_date::timestamp + p_series.time_of_day::interval);
    IF v_candidate_local <= v_from_local THEN
      v_candidate_local := ((v_local_date + interval '1 day')::date::timestamp)
                         + p_series.time_of_day::interval;
    END IF;
    WHILE extract(dow from v_candidate_local)::int IN (0, 6) LOOP
      v_candidate_local := v_candidate_local + interval '1 day';
    END LOOP;

  ELSIF p_series.cadence_type = 'weekly' THEN
    IF p_series.days_of_week IS NULL OR array_length(p_series.days_of_week, 1) IS NULL THEN
      v_candidate_local := (v_local_date::timestamp + p_series.time_of_day::interval);
      IF v_candidate_local <= v_from_local THEN
        v_candidate_local := ((v_local_date + (p_series.interval_n * 7 || ' days')::interval)::date::timestamp)
                           + p_series.time_of_day::interval;
      END IF;
    ELSE
      v_candidate_local := NULL;
      FOR v_i IN 0 .. (7 * p_series.interval_n) LOOP
        v_candidate_local := ((v_local_date + (v_i || ' days')::interval)::date::timestamp)
                           + p_series.time_of_day::interval;
        v_dow_local := extract(dow from v_candidate_local)::int;
        IF v_dow_local = ANY (p_series.days_of_week) AND v_candidate_local > v_from_local THEN
          EXIT;
        END IF;
        v_candidate_local := NULL;
      END LOOP;
    END IF;

  ELSIF p_series.cadence_type = 'monthly' THEN
    v_dom := COALESCE(p_series.day_of_month, 1);
    v_y := extract(year from v_local_date)::int;
    v_m := extract(month from v_local_date)::int;
    v_last_day := extract(day from (make_date(v_y, v_m, 1) + interval '1 month - 1 day'))::int;
    v_candidate_local := (make_date(
        v_y, v_m,
        CASE WHEN v_dom = -1 THEN v_last_day ELSE LEAST(v_dom, v_last_day) END
      )::timestamp + p_series.time_of_day::interval);
    IF v_candidate_local <= v_from_local THEN
      v_m := v_m + 1;
      IF v_m > 12 THEN v_m := 1; v_y := v_y + 1; END IF;
      v_last_day := extract(day from (make_date(v_y, v_m, 1) + interval '1 month - 1 day'))::int;
      v_candidate_local := (make_date(
          v_y, v_m,
          CASE WHEN v_dom = -1 THEN v_last_day ELSE LEAST(v_dom, v_last_day) END
        )::timestamp + p_series.time_of_day::interval);
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown cadence_type: %', p_series.cadence_type;
  END IF;

  IF v_candidate_local IS NULL THEN RETURN NULL; END IF;
  v_candidate_utc := (v_candidate_local AT TIME ZONE v_tz);
  RETURN v_candidate_utc;
END;
$$;

-- Sync next_occurrence_at on insert/update of cadence fields or unpausing.
CREATE OR REPLACE FUNCTION task_series_sync_next_occurrence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_from timestamptz;
BEGIN
  IF NEW.is_paused THEN
    NEW.next_occurrence_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.ends_after_count IS NOT NULL AND NEW.spawned_count >= NEW.ends_after_count THEN
    NEW.is_paused := true;
    NEW.next_occurrence_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR
     NEW.cadence_type IS DISTINCT FROM OLD.cadence_type OR
     NEW.interval_n   IS DISTINCT FROM OLD.interval_n OR
     NEW.days_of_week IS DISTINCT FROM OLD.days_of_week OR
     NEW.day_of_month IS DISTINCT FROM OLD.day_of_month OR
     NEW.time_of_day  IS DISTINCT FROM OLD.time_of_day OR
     NEW.timezone     IS DISTINCT FROM OLD.timezone OR
     NEW.starts_on    IS DISTINCT FROM OLD.starts_on OR
     (OLD.is_paused AND NOT NEW.is_paused)
  THEN
    v_from := GREATEST(
      (NEW.starts_on::timestamp AT TIME ZONE NEW.timezone) - interval '1 second',
      now()
    );
    NEW.next_occurrence_at := public.next_occurrence(NEW, v_from);
  END IF;

  IF NEW.ends_on IS NOT NULL
     AND NEW.next_occurrence_at IS NOT NULL
     AND (NEW.next_occurrence_at AT TIME ZONE NEW.timezone)::date > NEW.ends_on
  THEN
    NEW.is_paused := true;
    NEW.next_occurrence_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_series_sync ON task_series;
CREATE TRIGGER task_series_sync
  BEFORE INSERT OR UPDATE ON task_series
  FOR EACH ROW EXECUTE FUNCTION task_series_sync_next_occurrence();

-- Spawn one row per series that's due, auto-skip prior unfinished, catch up.
CREATE OR REPLACE FUNCTION spawn_due_task_instances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series          public.task_series;
  v_new_task_id     uuid;
  v_prior           public.tasks;
  v_occurrence_at   timestamptz;
  v_next_after      timestamptz;
  v_catchup_skipped int;
  v_meta            jsonb;
BEGIN
  FOR v_series IN
    SELECT * FROM public.task_series
    WHERE NOT is_paused
      AND next_occurrence_at IS NOT NULL
      AND next_occurrence_at <= now()
      AND (ends_on IS NULL OR (next_occurrence_at AT TIME ZONE timezone)::date <= ends_on)
      AND (ends_after_count IS NULL OR spawned_count < ends_after_count)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_occurrence_at := v_series.next_occurrence_at;
    v_catchup_skipped := 0;

    LOOP
      v_next_after := public.next_occurrence(v_series, v_occurrence_at);
      EXIT WHEN v_next_after IS NULL OR v_next_after > now();
      v_occurrence_at := v_next_after;
      v_catchup_skipped := v_catchup_skipped + 1;
    END LOOP;

    IF v_series.missed_policy = 'auto_skip' THEN
      SELECT * INTO v_prior FROM public.tasks
      WHERE series_id = v_series.id
        AND status NOT IN ('done','cancelled','missed')
      ORDER BY series_occurrence_at DESC
      LIMIT 1;

      IF v_prior.id IS NOT NULL THEN
        UPDATE public.tasks SET status = 'missed' WHERE id = v_prior.id;
        INSERT INTO public.audit_log (actor_type, module, entity_type, entity_id, action, summary, meta)
        VALUES (
          'system', 'tasks', 'task', v_prior.id, 'status_changed',
          'Auto-missed: new occurrence spawned before completion',
          jsonb_build_object('series_id', v_series.id, 'reason', 'recurring_auto_skip')
        );
      END IF;
    END IF;

    v_meta := v_series.meta;
    IF v_catchup_skipped > 0 THEN
      v_meta := v_meta || jsonb_build_object('catchup_skipped', v_catchup_skipped);
    END IF;

    INSERT INTO public.tasks (
      stream_id, title, description, priority,
      assignee_type, assignee_agent_id, tags,
      linked_entity_type, linked_entity_id,
      series_id, series_occurrence_at, due_at, due_date
    ) VALUES (
      v_series.stream_id, v_series.title, v_series.description, v_series.priority,
      v_series.assignee_type, v_series.assignee_agent_id, v_series.tags,
      v_series.linked_entity_type, v_series.linked_entity_id,
      v_series.id, v_occurrence_at, v_occurrence_at, v_occurrence_at
    )
    ON CONFLICT (series_id, series_occurrence_at) DO NOTHING
    RETURNING id INTO v_new_task_id;

    IF v_new_task_id IS NOT NULL THEN
      INSERT INTO public.audit_log (actor_type, module, entity_type, entity_id, action, summary, meta)
      VALUES (
        'system', 'tasks', 'task', v_new_task_id, 'created',
        'Recurring instance spawned: ' || v_series.title,
        jsonb_build_object(
          'series_id', v_series.id,
          'occurrence_at', v_occurrence_at,
          'catchup_skipped', v_catchup_skipped
        )
      );
    END IF;

    UPDATE public.task_series
    SET spawned_count      = spawned_count + 1,
        last_spawned_at    = now(),
        next_occurrence_at = public.next_occurrence(v_series, v_occurrence_at)
    WHERE id = v_series.id;

    UPDATE public.task_series
    SET is_paused = true, next_occurrence_at = NULL
    WHERE id = v_series.id
      AND (
        (ends_after_count IS NOT NULL AND spawned_count >= ends_after_count)
        OR (next_occurrence_at IS NOT NULL AND ends_on IS NOT NULL
            AND (next_occurrence_at AT TIME ZONE timezone)::date > ends_on)
      );
  END LOOP;
END;
$$;

-- Schedule the spawn function every minute.
DO $$ BEGIN PERFORM cron.unschedule('spawn-due-task-instances'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'spawn-due-task-instances',
  '* * * * *',
  $cron$SELECT public.spawn_due_task_instances();$cron$
);

GRANT EXECUTE ON FUNCTION public.spawn_due_task_instances() TO authenticated;

-- Diagnostic helper for inspecting recurring-task state from the app.
DROP FUNCTION IF EXISTS recurring_tasks_debug();
CREATE OR REPLACE FUNCTION recurring_tasks_debug()
RETURNS TABLE (
  series_id uuid,
  title text,
  is_paused boolean,
  next_occurrence_at timestamptz,
  now_at timestamptz,
  seconds_until_next double precision,
  spawned_count integer,
  last_spawned_at timestamptz,
  cadence_type text,
  time_of_day time,
  timezone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.title, s.is_paused, s.next_occurrence_at, now(),
    EXTRACT(EPOCH FROM (s.next_occurrence_at - now())),
    s.spawned_count, s.last_spawned_at, s.cadence_type, s.time_of_day, s.timezone
  FROM public.task_series s
  ORDER BY s.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.recurring_tasks_debug() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- 9. COMMENTS (polymorphic)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  parent_id       uuid REFERENCES comments(id) ON DELETE CASCADE,
  body            text NOT NULL,
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  mentions        text[] NOT NULL DEFAULT '{}'
);

-- Column reconciliation for comments
ALTER TABLE comments ADD COLUMN IF NOT EXISTS mentions text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_actor ON comments(actor_type, actor_agent_id);

DROP TRIGGER IF EXISTS comments_updated_at ON comments;
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 10. TASK ATTACHMENTS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS task_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,
  entity_id     uuid,
  url           text,
  label         text,
  CONSTRAINT task_attachments_entity_check
    CHECK (
      (entity_type IN ('document', 'asset') AND entity_id IS NOT NULL AND url IS NULL) OR
      (entity_type = 'url' AND url IS NOT NULL AND entity_id IS NULL)
    ),
  CONSTRAINT task_attachments_unique_entity
    UNIQUE (task_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

DROP TRIGGER IF EXISTS task_attachments_updated_at ON task_attachments;
CREATE TRIGGER task_attachments_updated_at
  BEFORE UPDATE ON task_attachments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sync parent task updated_at on attachment changes
CREATE OR REPLACE FUNCTION sync_task_attachment_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tasks SET updated_at = now()
  WHERE id = coalesce(NEW.task_id, OLD.task_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS task_attachments_sync_parent ON task_attachments;
CREATE TRIGGER task_attachments_sync_parent
  AFTER INSERT OR DELETE ON task_attachments
  FOR EACH ROW EXECUTE FUNCTION sync_task_attachment_updated();

-- ════════════════════════════════════════════════════════════════
-- 11. ASSETS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS asset_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  parent_id   uuid REFERENCES asset_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text,
  sort_order  integer DEFAULT 0
);

DROP TRIGGER IF EXISTS asset_folders_updated_at ON asset_folders;
CREATE TRIGGER asset_folders_updated_at
  BEFORE UPDATE ON asset_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  folder_id   uuid REFERENCES asset_folders(id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text,
  type        asset_type NOT NULL DEFAULT 'document',
  mime_type   text,
  file_url    text,
  file_size   bigint,
  content     text,
  tags        text[] NOT NULL DEFAULT '{}',
  meta        jsonb NOT NULL DEFAULT '{}',
  archived_at timestamptz
);

-- Column reconciliation for assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_assets_folder ON assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_assets_active ON assets(created_at DESC) WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS assets_updated_at ON assets;
CREATE TRIGGER assets_updated_at
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 12. DOCUMENTS (knowledge base)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  parent_id   uuid REFERENCES document_folders(id) ON DELETE CASCADE,
  name        text NOT NULL,
  icon        text,
  sort_order  integer DEFAULT 0
);

DROP TRIGGER IF EXISTS document_folders_updated_at ON document_folders;
CREATE TRIGGER document_folders_updated_at
  BEFORE UPDATE ON document_folders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  folder_id   uuid REFERENCES document_folders(id) ON DELETE SET NULL,
  title       text NOT NULL,
  content     jsonb,
  tags        text[] NOT NULL DEFAULT '{}',
  pinned      boolean DEFAULT false,
  meta        jsonb NOT NULL DEFAULT '{}',
  embedding   extensions.vector(1536),
  archived_at timestamptz
);

-- Column reconciliation for documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_documents_pinned ON documents(pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_documents_active ON documents(created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents
  USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 10);

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Semantic search function (DROP first — return type may have changed)
DROP FUNCTION IF EXISTS search_documents(extensions.vector, integer, text[], uuid);
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding extensions.vector(1536),
  match_count integer DEFAULT 5,
  filter_tags text[] DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, title text, content jsonb, tags text[], folder_id uuid,
  updated_at timestamptz, meta jsonb, similarity float
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.title, d.content, d.tags, d.folder_id,
    d.updated_at, d.meta,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM public.documents d
  WHERE d.embedding IS NOT NULL
    AND d.archived_at IS NULL
    AND (filter_tags IS NULL OR d.tags && filter_tags)
    AND (filter_folder_id IS NULL OR d.folder_id = filter_folder_id)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 13. DRAFT SETS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS draft_sets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  contact_id            uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES templates(id) ON DELETE SET NULL,
  channel               text NOT NULL,
  stage                 text NOT NULL,
  version               integer NOT NULL DEFAULT 1,
  variants              jsonb NOT NULL,
  selected_variant_index integer,
  based_on_draft_set_id uuid REFERENCES draft_sets(id) ON DELETE SET NULL,
  feedback_notes        text,
  status                text NOT NULL DEFAULT 'draft',
  meta                  jsonb NOT NULL DEFAULT '{}',
  CONSTRAINT draft_sets_version_check CHECK (version >= 1),
  CONSTRAINT draft_sets_variants_is_array CHECK (jsonb_typeof(variants) = 'array'),
  CONSTRAINT draft_sets_contact_channel_stage_version_key
    UNIQUE (contact_id, channel, stage, version)
);

CREATE INDEX IF NOT EXISTS idx_draft_sets_contact ON draft_sets(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draft_sets_status ON draft_sets(status);

DROP TRIGGER IF EXISTS draft_sets_updated_at ON draft_sets;
CREATE TRIGGER draft_sets_updated_at
  BEFORE UPDATE ON draft_sets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- 14. AUDIT LOG
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  module          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  action          audit_action NOT NULL,
  summary         text,
  changes         jsonb,
  meta            jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_module ON audit_log(module);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_type, actor_agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- Column reconciliation for audit_log
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

-- ════════════════════════════════════════════════════════════════
-- 15. NOTIFICATIONS
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  type            text NOT NULL,
  title           text NOT NULL,
  body            text,
  entity_type     text,
  entity_id       uuid,
  actor_type      actor_type DEFAULT 'system',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  is_read         boolean DEFAULT false,
  read_at         timestamptz,
  dismissed_at    timestamptz,
  meta            jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_type actor_type DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_agent_id uuid;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(created_at DESC) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- ════════════════════════════════════════════════════════════════
-- 16. AGENT INBOX
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_inbox_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  agent_id              uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_slug            text NOT NULL,
  event_type            inbox_event_type NOT NULL,
  task_id               uuid REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id            uuid REFERENCES comments(id) ON DELETE CASCADE,
  contact_id            uuid REFERENCES contacts(id) ON DELETE CASCADE,
  status                inbox_item_status NOT NULL DEFAULT 'pending',
  leased_at             timestamptz,
  leased_until          timestamptz,
  completed_at          timestamptz,
  failed_at             timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 3,
  summary               text,
  context               jsonb NOT NULL DEFAULT '{}',
  last_wake_attempt_at  timestamptz,
  last_wake_success_at  timestamptz,
  dedup_key             text NOT NULL,
  CONSTRAINT uq_inbox_dedup UNIQUE (dedup_key)
);

-- Column reconciliation for agent_inbox_items
ALTER TABLE agent_inbox_items ADD COLUMN IF NOT EXISTS last_wake_attempt_at timestamptz;
ALTER TABLE agent_inbox_items ADD COLUMN IF NOT EXISTS last_wake_success_at timestamptz;
ALTER TABLE agent_inbox_items ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE INDEX IF NOT EXISTS idx_inbox_agent_status ON agent_inbox_items(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_agent_pending ON agent_inbox_items(agent_id, status, created_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_inbox_status ON agent_inbox_items(status);
CREATE INDEX IF NOT EXISTS idx_inbox_leased ON agent_inbox_items(leased_until) WHERE status = 'leased';
CREATE INDEX IF NOT EXISTS idx_inbox_task ON agent_inbox_items(task_id);
CREATE INDEX IF NOT EXISTS idx_inbox_contact ON agent_inbox_items(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_created ON agent_inbox_items(created_at DESC);

DROP TRIGGER IF EXISTS inbox_items_updated_at ON agent_inbox_items;
CREATE TRIGGER inbox_items_updated_at
  BEFORE UPDATE ON agent_inbox_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lease next pending item (atomic, row-locked)
CREATE OR REPLACE FUNCTION lease_inbox_item(
  p_agent_id uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF agent_inbox_items
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.agent_inbox_items
  SET
    status = 'leased',
    leased_at = now(),
    leased_until = now() + (p_lease_seconds || ' seconds')::interval,
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = (
    SELECT id FROM public.agent_inbox_items
    WHERE agent_id = p_agent_id
      AND attempt_count < max_attempts
      AND (
        status = 'pending'
        OR (status = 'leased' AND leased_until < now())
        OR status = 'failed'
      )
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Complete an inbox item
CREATE OR REPLACE FUNCTION complete_inbox_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_inbox_items
  SET status = 'done', completed_at = now(), updated_at = now()
  WHERE id = p_item_id;
END;
$$;

-- Fail an inbox item (promotes to dead_letter after max_attempts)
CREATE OR REPLACE FUNCTION fail_inbox_item(p_item_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item public.agent_inbox_items;
BEGIN
  SELECT * INTO v_item FROM public.agent_inbox_items WHERE id = p_item_id;
  IF v_item.attempt_count >= v_item.max_attempts THEN
    UPDATE public.agent_inbox_items
    SET status = 'dead_letter', failed_at = now(), updated_at = now(),
        context = context || jsonb_build_object('last_failure_reason', p_reason)
    WHERE id = p_item_id;
  ELSE
    UPDATE public.agent_inbox_items
    SET status = 'failed', failed_at = now(), updated_at = now(),
        context = context || jsonb_build_object('last_failure_reason', p_reason)
    WHERE id = p_item_id;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- 17. INBOX TRIGGERS
-- ════════════════════════════════════════════════════════════════

-- Auto-enqueue on task assignment
CREATE OR REPLACE FUNCTION enqueue_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent_slug text;
  v_dedup_key text;
BEGIN
  IF NEW.assignee_agent_id IS NULL THEN RETURN NEW; END IF;

  SELECT slug INTO v_agent_slug FROM public.agents WHERE id = NEW.assignee_agent_id;
  IF v_agent_slug IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' OR OLD.assignee_agent_id IS NULL OR OLD.assignee_agent_id != NEW.assignee_agent_id THEN
    IF OLD IS NOT NULL AND OLD.assignee_agent_id IS NOT NULL AND OLD.assignee_agent_id != NEW.assignee_agent_id THEN
      v_dedup_key := 'task_reassignment:' || NEW.id || ':' || NEW.assignee_agent_id;
      INSERT INTO public.agent_inbox_items (agent_id, agent_slug, event_type, task_id, summary, dedup_key, context)
      VALUES (
        NEW.assignee_agent_id, v_agent_slug, 'task_reassignment', NEW.id,
        'Task reassigned: ' || COALESCE(NEW.title, 'Untitled'), v_dedup_key,
        jsonb_build_object('task_title', NEW.title, 'task_status', NEW.status,
          'task_priority', NEW.priority, 'previous_agent_id', OLD.assignee_agent_id)
      ) ON CONFLICT (dedup_key) DO NOTHING;
    ELSE
      v_dedup_key := 'task_assignment:' || NEW.id || ':' || NEW.assignee_agent_id;
      INSERT INTO public.agent_inbox_items (agent_id, agent_slug, event_type, task_id, summary, dedup_key, context)
      VALUES (
        NEW.assignee_agent_id, v_agent_slug, 'task_assignment', NEW.id,
        'Task assigned: ' || COALESCE(NEW.title, 'Untitled'), v_dedup_key,
        jsonb_build_object('task_title', NEW.title, 'task_status', NEW.status, 'task_priority', NEW.priority)
      ) ON CONFLICT (dedup_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enqueue_assignment ON tasks;
CREATE TRIGGER tasks_enqueue_assignment
  AFTER INSERT OR UPDATE OF assignee_agent_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_task_assignment();

-- Auto-enqueue on comment @mentions (polymorphic)
CREATE OR REPLACE FUNCTION enqueue_comment_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_mention text;
  v_agent_record RECORD;
  v_dedup_key text;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_mention IN ARRAY NEW.mentions LOOP
    v_mention := ltrim(v_mention, '@');
    SELECT id, slug INTO v_agent_record FROM public.agents WHERE slug = v_mention;
    IF v_agent_record.id IS NULL THEN CONTINUE; END IF;
    IF NEW.actor_agent_id = v_agent_record.id THEN CONTINUE; END IF;

    v_dedup_key := 'comment_mention:' || NEW.id || ':' || v_agent_record.id;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type, task_id, comment_id, summary, dedup_key, context
    ) VALUES (
      v_agent_record.id, v_agent_record.slug, 'task_comment_mention',
      CASE WHEN NEW.entity_type = 'task' THEN NEW.entity_id ELSE NULL END,
      NEW.id,
      '@' || v_agent_record.slug || ' mentioned in comment', v_dedup_key,
      jsonb_build_object(
        'comment_body', left(NEW.body, 500),
        'entity_type', NEW.entity_type, 'entity_id', NEW.entity_id,
        'actor_type', NEW.actor_type, 'actor_agent_id', NEW.actor_agent_id
      )
    ) ON CONFLICT (dedup_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_enqueue_mentions ON comments;
CREATE TRIGGER comments_enqueue_mentions
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION enqueue_comment_mentions();

-- ════════════════════════════════════════════════════════════════
-- 18. AGENT COMMANDS
-- ════════════════════════════════════════════════════════════════

-- Command queue for managing agent lifecycle and system operations
-- from the UI. A daemon on the agent host watches this table via
-- Supabase Realtime, leases commands, executes them, and writes
-- results back.

DO $$ BEGIN
  CREATE TYPE command_action AS ENUM (
    'provision', 'approve_pairing', 'update', 'remove',
    'restart_gateway', 'update_all', 'restart_dispatcher'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
-- p_gateway_slug: runner passes its GATEWAY_ID/slug; only commands bound to
-- that gateway (or unbound legacy commands) are leased. Pass NULL to lease
-- any pending command (legacy behavior).
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

-- ════════════════════════════════════════════════════════════════
-- 19. AUTOMATION RULES
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS automation_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  table_name        text NOT NULL,
  field             text,
  condition         automation_condition NOT NULL,
  value             text,
  target_agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_slug text NOT NULL,
  event_type        inbox_event_type NOT NULL,
  summary_template  text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  meta              jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for automation_rules
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_automation_rules_table ON automation_rules(table_name);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON automation_rules(table_name, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_agent ON automation_rules(target_agent_id);

DROP TRIGGER IF EXISTS automation_rules_updated_at ON automation_rules;
CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contact automation trigger (with JSONB extended field fallback)
CREATE OR REPLACE FUNCTION process_contact_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rule RECORD;
  v_dedup_key text;
  v_summary text;
  v_old_value text;
  v_new_value text;
BEGIN
  FOR v_rule IN
    SELECT * FROM public.automation_rules
    WHERE table_name = 'contacts' AND is_active = true
  LOOP

    IF v_rule.condition = 'created' THEN
      IF TG_OP != 'INSERT' THEN CONTINUE; END IF;
      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':created';
      v_summary := replace(
        replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
        '{new_value}', ''
      );

    ELSIF v_rule.condition = 'changed_to' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      -- Resolve field values: real columns first, then extended JSONB
      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_new_value IS NULL OR v_new_value != v_rule.value OR v_old_value = v_new_value THEN
        CONTINUE;
      END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':' || COALESCE(v_new_value, 'null') || ':' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    ELSIF v_rule.condition = 'changed_from' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_old_value IS NULL OR v_old_value != v_rule.value OR v_old_value = v_new_value THEN
        CONTINUE;
      END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':from_' || COALESCE(v_old_value, 'null') || ':' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    ELSIF v_rule.condition = 'any_change' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_old_value = v_new_value THEN CONTINUE; END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':any_' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    END IF;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type,
      contact_id, summary, dedup_key, context
    ) VALUES (
      v_rule.target_agent_id, v_rule.target_agent_slug,
      v_rule.event_type, NEW.id, v_summary, v_dedup_key,
      jsonb_build_object(
        'rule_id', v_rule.id, 'table', 'contacts',
        'field', v_rule.field, 'condition', v_rule.condition::text,
        'old_value', v_old_value, 'new_value', v_new_value,
        'contact_name', NEW.name, 'contact_status', NEW.status
      )
    ) ON CONFLICT (dedup_key) DO NOTHING;

  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_automation ON contacts;
CREATE TRIGGER contacts_automation
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION process_contact_automation();

-- ════════════════════════════════════════════════════════════════
-- 20. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════

-- Grant base table privileges. RLS runs *after* table-level GRANTs, so
-- without these the role gets "permission denied" before policies are
-- ever evaluated. `authenticated` = UI users (RLS applies).
-- `service_role` = agents / background daemons (bypasses RLS, but still
-- needs table grants).
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'workspace', 'pipeline_stages', 'field_definitions',
    'tags', 'campaigns', 'contacts', 'organizations', 'contact_organizations',
    'templates', 'interactions', 'draft_sets',
    'gateways',
    'agents', 'streams', 'tasks', 'task_series', 'comments', 'task_attachments',
    'asset_folders', 'assets', 'document_folders', 'documents',
    'audit_log', 'notifications',
    'agent_inbox_items', 'automation_rules',
    'agent_commands'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON %I', _tbl);
    EXECUTE format(
      'CREATE POLICY "Authenticated full access" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      _tbl
    );
  END LOOP;
END
$$;

-- ════════════════════════════════════════════════════════════════
-- 21. REALTIME
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'contacts', 'organizations', 'contact_organizations', 'interactions',
    'templates', 'campaigns', 'tags', 'draft_sets',
    'gateways',
    'agents', 'streams', 'tasks', 'task_series', 'comments', 'task_attachments',
    'audit_log', 'notifications',
    'asset_folders', 'assets', 'document_folders', 'documents',
    'agent_inbox_items', 'automation_rules', 'agent_commands',
    'pipeline_stages', 'field_definitions', 'workspace'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', _tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', _tbl);
  END LOOP;
END
$$;

-- ════════════════════════════════════════════════════════════════
-- 22. STORAGE
-- ════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assets');

DROP POLICY IF EXISTS "Authenticated users can read assets" ON storage.objects;
CREATE POLICY "Authenticated users can read assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "Authenticated users can update assets" ON storage.objects;
CREATE POLICY "Authenticated users can update assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "Authenticated users can delete assets" ON storage.objects;
CREATE POLICY "Authenticated users can delete assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'assets');

-- ════════════════════════════════════════════════════════════════
-- 23. SEED: INITIAL WORKSPACE ROW
-- ════════════════════════════════════════════════════════════════

-- Only insert if no workspace row exists (singleton)
INSERT INTO workspace (name, initialized)
SELECT 'HQ', false
WHERE NOT EXISTS (SELECT 1 FROM workspace);

-- ════════════════════════════════════════════════════════════════
-- 24. SETUP WIZARD RPC
-- ════════════════════════════════════════════════════════════════

-- Setup wizard RPC: atomic workspace initialization.
-- Called by the first-run setup wizard to seed pipeline_stages,
-- field_definitions, streams, and mark the workspace as initialized.
-- Idempotent: clears existing wizard-seeded rows before inserting.

CREATE OR REPLACE FUNCTION complete_setup(
  p_name text,
  p_slug text,
  p_description text,
  p_owner_name text,
  p_preferred_name text,
  p_timezone text,
  p_stages jsonb,
  p_fields jsonb,
  p_streams jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Update the singleton workspace row
  UPDATE public.workspace SET
    name = p_name,
    slug = p_slug,
    description = nullif(p_description, ''),
    owner_name = nullif(p_owner_name, ''),
    owner_preferred_name = nullif(p_preferred_name, ''),
    owner_timezone = nullif(p_timezone, ''),
    initialized = true,
    updated_at = now()
  WHERE initialized = false;

  -- Clear any existing rows to make this idempotent
  DELETE FROM public.pipeline_stages WHERE entity_type = 'contact';
  DELETE FROM public.field_definitions WHERE entity_type = 'contact';
  DELETE FROM public.streams WHERE true;

  -- Seed pipeline stages
  INSERT INTO public.pipeline_stages (entity_type, stage_key, label, color, sort_order, is_terminal, is_default)
  SELECT
    'contact',
    s->>'stage_key',
    s->>'label',
    s->>'color',
    coalesce((s->>'sort_order')::int, 0),
    coalesce((s->>'is_terminal')::bool, false),
    coalesce((s->>'is_default')::bool, false)
  FROM jsonb_array_elements(p_stages) AS s;

  -- Seed field definitions
  INSERT INTO public.field_definitions (entity_type, field_key, field_type, label, field_group, sort_order, required, options, description, is_active)
  SELECT
    'contact',
    f->>'field_key',
    f->>'field_type',
    f->>'label',
    f->>'field_group',
    coalesce((f->>'sort_order')::int, 0),
    coalesce((f->>'required')::bool, false),
    CASE WHEN f->'options' IS NOT NULL AND f->>'options' != 'null'
         THEN f->'options'
         ELSE NULL END,
    nullif(f->>'description', ''),
    true
  FROM jsonb_array_elements(p_fields) AS f;

  -- Seed task streams
  INSERT INTO public.streams (name, description, type, color, icon, sort_order, meta)
  SELECT
    st->>'name',
    nullif(st->>'description', ''),
    coalesce((st->>'type')::public.stream_type, 'functional'),
    st->>'color',
    st->>'icon',
    coalesce((st->>'sort_order')::int, 0),
    '{}'::jsonb
  FROM jsonb_array_elements(p_streams) AS st;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- GATEWAY REGISTRATION TOKENS
-- ════════════════════════════════════════════════════════════════
--
-- A token is minted by the UI when the user wants to add a new gateway
-- to this project. The UI displays a one-liner that embeds the token;
-- the target machine runs install-gateway.sh, which calls
-- consume_gateway_token() to exchange the token for this project's
-- service role key and gateway_id. Token is single-use, 15-minute TTL.
--
-- Storage is SHA-256 of the token, not the token itself, so a DB leak
-- doesn't expose the bootstrap creds. The plaintext lives only in the
-- UI response (shown once) and on the target machine's stdin.

CREATE TABLE IF NOT EXISTS gateway_registration_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  token_hash      text NOT NULL UNIQUE,
  label           text,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  consumed_by_gateway_id uuid REFERENCES gateways(id)
);

CREATE INDEX IF NOT EXISTS idx_gateway_tokens_expires
  ON gateway_registration_tokens(expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE gateway_registration_tokens ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage their own tokens (this is a single-user
-- install — "authenticated" == "the owner").
DROP POLICY IF EXISTS gateway_registration_tokens_all ON gateway_registration_tokens;
CREATE POLICY gateway_registration_tokens_all ON gateway_registration_tokens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON gateway_registration_tokens TO authenticated;

-- consume_gateway_token: atomic token exchange.
--
-- Takes the plaintext token + desired gateway label; returns:
--   { gateway_id: uuid, gateway_slug: text }
--
-- Creates a new gateways row if one doesn't exist under this slug;
-- otherwise returns the existing id (idempotent for re-runs).
--
-- SECURITY DEFINER so it can write to gateways without going through
-- RLS on behalf of an unauthenticated caller (install-gateway.sh
-- doesn't have a Supabase auth session — it has only the token).
--
-- NOTE: The service role key itself is NOT returned by this function.
-- The caller (install-gateway.sh) is invoked with SUPABASE_URL and the
-- token in its env; it uses the PostgREST endpoint with ANON KEY to
-- call this RPC. After consumption, the gateway writes the service role
-- key it receives from the UI-side token mint flow (which embeds it in
-- the one-liner) into its own /config/secrets.json on the remote host.
-- This keeps the service role key off Supabase's request logs.

CREATE OR REPLACE FUNCTION consume_gateway_token(
  p_token     text,
  p_label     text DEFAULT NULL,
  p_slug_hint text DEFAULT NULL
)
RETURNS TABLE (gateway_id uuid, gateway_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token_hash text;
  v_token_row  public.gateway_registration_tokens%ROWTYPE;
  v_gateway_id uuid;
  v_slug       text;
  v_label      text;
BEGIN
  -- Normalize + hash the submitted token
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  -- Lookup + lock
  SELECT * INTO v_token_row
    FROM public.gateway_registration_tokens
   WHERE token_hash = v_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token' USING ERRCODE = '28000';
  END IF;

  IF v_token_row.consumed_at IS NOT NULL THEN
    -- Allow idempotent replays from the same gateway (retry on flaky
    -- install-gateway.sh runs). Return whatever we recorded.
    RETURN QUERY
      SELECT g.id, g.slug
        FROM public.gateways g
       WHERE g.id = v_token_row.consumed_by_gateway_id;
    RETURN;
  END IF;

  IF v_token_row.expires_at < now() THEN
    RAISE EXCEPTION 'token_expired' USING ERRCODE = '28000';
  END IF;

  -- Resolve slug + label
  v_label := COALESCE(
    NULLIF(trim(p_label),        ''),
    NULLIF(trim(v_token_row.label), ''),
    'Gateway'
  );
  v_slug := COALESCE(NULLIF(trim(p_slug_hint), ''), lower(regexp_replace(v_label, '[^a-zA-Z0-9]+', '-', 'g')));
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  IF v_slug = '' THEN v_slug := 'gateway'; END IF;

  -- Ensure slug is unique by appending -2, -3, ... if needed
  IF EXISTS (SELECT 1 FROM public.gateways WHERE slug = v_slug) THEN
    DECLARE
      v_suffix int := 2;
      v_try    text;
    BEGIN
      LOOP
        v_try := v_slug || '-' || v_suffix;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gateways WHERE slug = v_try);
        v_suffix := v_suffix + 1;
      END LOOP;
      v_slug := v_try;
    END;
  END IF;

  -- Create the gateway row
  INSERT INTO public.gateways (slug, label, status, meta)
  VALUES (v_slug, v_label, 'provisioning', jsonb_build_object('registered_via', 'token'))
  RETURNING id INTO v_gateway_id;

  -- Mark the token consumed
  UPDATE public.gateway_registration_tokens
     SET consumed_at = now(),
         consumed_by_gateway_id = v_gateway_id
   WHERE id = v_token_row.id;

  RETURN QUERY SELECT v_gateway_id, v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_gateway_token(text, text, text) TO anon, authenticated;

-- Required by digest(); ensure pgcrypto is present (idempotent)
CREATE EXTENSION IF NOT EXISTS pgcrypto;
