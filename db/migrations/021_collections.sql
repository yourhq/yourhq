-- 021_collections.sql — User-defined tables with JSONB-backed records.

-- ── collection_definitions ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_definitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  tenant_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  icon        text,
  color       text DEFAULT '#6b7280',
  sort_order  integer DEFAULT 0,
  meta        jsonb NOT NULL DEFAULT '{}',
  archived_at timestamptz,
  CONSTRAINT collection_definitions_slug_unique UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_collection_definitions_tenant ON collection_definitions(tenant_id);

DROP TRIGGER IF EXISTS collection_definitions_updated_at ON collection_definitions;
CREATE TRIGGER collection_definitions_updated_at
  BEFORE UPDATE ON collection_definitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── collection_fields ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_fields (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  collection_id   uuid NOT NULL REFERENCES collection_definitions(id) ON DELETE CASCADE,
  field_key       text NOT NULL,
  field_type      text NOT NULL CHECK (field_type IN (
    'text', 'number', 'date', 'datetime', 'boolean',
    'select', 'multi_select', 'url', 'email', 'phone',
    'relation', 'rich_text'
  )),
  label           text NOT NULL,
  description     text,
  sort_order      integer DEFAULT 0,
  required        boolean DEFAULT false,
  options         jsonb,
  default_value   jsonb,
  is_title_field  boolean DEFAULT false,
  is_active       boolean DEFAULT true,
  CONSTRAINT collection_fields_key_unique UNIQUE (collection_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_collection_fields_collection ON collection_fields(collection_id);

DROP TRIGGER IF EXISTS collection_fields_updated_at ON collection_fields;
CREATE TRIGGER collection_fields_updated_at
  BEFORE UPDATE ON collection_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── collection_records ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  collection_id   uuid NOT NULL REFERENCES collection_definitions(id) ON DELETE CASCADE,
  "values"        jsonb NOT NULL DEFAULT '{}',
  sort_order      integer DEFAULT 0,
  archived_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_collection_records_collection ON collection_records(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_records_active ON collection_records(collection_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_collection_records_values ON collection_records USING gin("values");
CREATE INDEX IF NOT EXISTS idx_collection_records_tenant ON collection_records(tenant_id);

DROP TRIGGER IF EXISTS collection_records_updated_at ON collection_records;
CREATE TRIGGER collection_records_updated_at
  BEFORE UPDATE ON collection_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── collection_views ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS collection_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                    REFERENCES tenants(id) ON DELETE CASCADE,
  collection_id   uuid NOT NULL REFERENCES collection_definitions(id) ON DELETE CASCADE,
  name            text NOT NULL,
  view_type       text NOT NULL CHECK (view_type IN ('table', 'kanban', 'calendar')),
  config          jsonb NOT NULL DEFAULT '{}',
  is_default      boolean DEFAULT false,
  sort_order      integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_collection_views_collection ON collection_views(collection_id);

DROP TRIGGER IF EXISTS collection_views_updated_at ON collection_views;
CREATE TRIGGER collection_views_updated_at
  BEFORE UPDATE ON collection_views FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── collection_templates (global, not tenant-scoped) ──────────────

CREATE TABLE IF NOT EXISTS collection_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  description text,
  icon        text,
  category    text,
  definition  jsonb NOT NULL,
  sort_order  integer DEFAULT 0
);

-- ── Seed templates ───────────────────────────────────────────────

INSERT INTO collection_templates (name, slug, description, icon, category, definition, sort_order)
VALUES (
  'Job Search',
  'job-search',
  'Track job applications, interviews, and offers',
  '💼',
  'productivity',
  '{
    "fields": [
      {"field_key": "company", "field_type": "text", "label": "Company", "sort_order": 0, "required": true, "is_title_field": true},
      {"field_key": "role", "field_type": "text", "label": "Role", "sort_order": 1, "required": true},
      {"field_key": "status", "field_type": "select", "label": "Status", "sort_order": 2, "required": true, "options": {"choices": [
        {"value": "researching", "label": "Researching", "color": "#6b7280"},
        {"value": "applied", "label": "Applied", "color": "#3b82f6"},
        {"value": "screening", "label": "Screening", "color": "#8b5cf6"},
        {"value": "interviewing", "label": "Interviewing", "color": "#f59e0b"},
        {"value": "offer", "label": "Offer", "color": "#22c55e"},
        {"value": "rejected", "label": "Rejected", "color": "#ef4444"},
        {"value": "withdrawn", "label": "Withdrawn", "color": "#9ca3af"}
      ]}, "default_value": "researching"},
      {"field_key": "url", "field_type": "url", "label": "Job Listing URL", "sort_order": 3},
      {"field_key": "salary_range", "field_type": "text", "label": "Salary Range", "sort_order": 4},
      {"field_key": "location", "field_type": "text", "label": "Location", "sort_order": 5},
      {"field_key": "applied_date", "field_type": "date", "label": "Applied Date", "sort_order": 6},
      {"field_key": "next_step", "field_type": "text", "label": "Next Step", "sort_order": 7},
      {"field_key": "notes", "field_type": "rich_text", "label": "Notes", "sort_order": 8}
    ],
    "views": [
      {"name": "All Applications", "view_type": "table", "is_default": true, "config": {}},
      {"name": "Pipeline", "view_type": "kanban", "config": {"group_by_field": "status"}}
    ]
  }'::jsonb,
  0
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO collection_templates (name, slug, description, icon, category, definition, sort_order)
VALUES (
  'Inventory',
  'inventory',
  'Track products, stock levels, and suppliers',
  '📦',
  'business',
  '{
    "fields": [
      {"field_key": "name", "field_type": "text", "label": "Item Name", "sort_order": 0, "required": true, "is_title_field": true},
      {"field_key": "sku", "field_type": "text", "label": "SKU", "sort_order": 1},
      {"field_key": "category", "field_type": "select", "label": "Category", "sort_order": 2, "options": {"choices": [
        {"value": "product", "label": "Product", "color": "#3b82f6"},
        {"value": "material", "label": "Raw Material", "color": "#f59e0b"},
        {"value": "equipment", "label": "Equipment", "color": "#8b5cf6"}
      ]}},
      {"field_key": "quantity", "field_type": "number", "label": "Quantity", "sort_order": 3, "required": true, "default_value": 0},
      {"field_key": "unit_price", "field_type": "number", "label": "Unit Price", "sort_order": 4},
      {"field_key": "supplier", "field_type": "text", "label": "Supplier", "sort_order": 5},
      {"field_key": "reorder_point", "field_type": "number", "label": "Reorder Point", "sort_order": 6},
      {"field_key": "notes", "field_type": "rich_text", "label": "Notes", "sort_order": 7}
    ],
    "views": [
      {"name": "All Items", "view_type": "table", "is_default": true, "config": {}}
    ]
  }'::jsonb,
  1
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO collection_templates (name, slug, description, icon, category, definition, sort_order)
VALUES (
  'Content Calendar',
  'content-calendar',
  'Plan and track content across channels',
  '📅',
  'marketing',
  '{
    "fields": [
      {"field_key": "title", "field_type": "text", "label": "Title", "sort_order": 0, "required": true, "is_title_field": true},
      {"field_key": "status", "field_type": "select", "label": "Status", "sort_order": 1, "options": {"choices": [
        {"value": "idea", "label": "Idea", "color": "#6b7280"},
        {"value": "drafting", "label": "Drafting", "color": "#3b82f6"},
        {"value": "review", "label": "In Review", "color": "#f59e0b"},
        {"value": "scheduled", "label": "Scheduled", "color": "#8b5cf6"},
        {"value": "published", "label": "Published", "color": "#22c55e"}
      ]}, "default_value": "idea"},
      {"field_key": "channel", "field_type": "select", "label": "Channel", "sort_order": 2, "options": {"choices": [
        {"value": "blog", "label": "Blog", "color": "#3b82f6"},
        {"value": "twitter", "label": "Twitter/X", "color": "#1d9bf0"},
        {"value": "linkedin", "label": "LinkedIn", "color": "#0a66c2"},
        {"value": "newsletter", "label": "Newsletter", "color": "#f59e0b"},
        {"value": "youtube", "label": "YouTube", "color": "#ef4444"}
      ]}},
      {"field_key": "publish_date", "field_type": "date", "label": "Publish Date", "sort_order": 3},
      {"field_key": "author", "field_type": "text", "label": "Author", "sort_order": 4},
      {"field_key": "content", "field_type": "rich_text", "label": "Content / Brief", "sort_order": 5}
    ],
    "views": [
      {"name": "All Content", "view_type": "table", "is_default": true, "config": {}},
      {"name": "Board", "view_type": "kanban", "config": {"group_by_field": "status"}},
      {"name": "Calendar", "view_type": "calendar", "config": {"date_field": "publish_date"}}
    ]
  }'::jsonb,
  2
) ON CONFLICT (slug) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────

ALTER TABLE collection_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON collection_definitions;
CREATE POLICY "Tenant isolation" ON collection_definitions
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON collection_definitions;
CREATE POLICY "Service role full access" ON collection_definitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenant isolation" ON collection_fields;
CREATE POLICY "Tenant isolation" ON collection_fields
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON collection_fields;
CREATE POLICY "Service role full access" ON collection_fields
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenant isolation" ON collection_records;
CREATE POLICY "Tenant isolation" ON collection_records
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON collection_records;
CREATE POLICY "Service role full access" ON collection_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Tenant isolation" ON collection_views;
CREATE POLICY "Tenant isolation" ON collection_views
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON collection_views;
CREATE POLICY "Service role full access" ON collection_views
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Realtime ──────────────────────────────────────────────────────

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'collection_definitions', 'collection_fields',
    'collection_records', 'collection_views'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', _tbl);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', _tbl);
  END LOOP;
END $$;

-- ── Grants ────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON collection_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_fields TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_records TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_views TO service_role;
GRANT SELECT ON collection_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON collection_templates TO service_role;
