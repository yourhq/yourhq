-- 016_rls_realtime_storage.sql — Row-level security, Realtime subscriptions, and Storage buckets.

-- ── Schema-level GRANTs ─────────────────────────────────────────

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

-- ── Row-level security ──────────────────────────────────────────

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
    'knowledge_sources', 'knowledge_chunks',
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

-- ── Realtime subscriptions ──────────────────────────────────────

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
    'knowledge_sources', 'knowledge_chunks',
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

-- ── Storage ─────────────────────────────────────────────────────

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
