-- 019_rls_tenant_scoped.sql — Replace open RLS policies with tenant_id-scoped ones.
--
-- For OSS and paid hosted (single tenant per Supabase project), these
-- policies are effectively the same as USING(true) because all rows share
-- the same tenant_id. For free hosted (v1.1, shared Supabase), these
-- policies enforce real multi-tenant isolation.
--
-- The JWT claim: Supabase Auth stores app_metadata in the JWT. We set
-- app_metadata.tenant_id on user creation. The expression
-- (auth.jwt()->'app_metadata'->>'tenant_id')::uuid extracts it.

-- ── Helper: extract tenant_id from JWT ─────────────────────────────

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

GRANT EXECUTE ON FUNCTION current_tenant_id() TO authenticated, service_role;

-- ── Replace RLS policies on all tenant-scoped tables ───────────────

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
    'knowledge_sources', 'knowledge_chunks',
    'audit_log', 'notifications',
    'agent_inbox_items', 'automation_rules',
    'agent_commands',
    'agent_usage', 'agent_budgets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', _tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Authenticated full access" ON %I', _tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation" ON %I', _tbl);

    EXECUTE format(
      'CREATE POLICY "Tenant isolation" ON %I FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id())',
      _tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS "Service role full access" ON %I', _tbl);
    EXECUTE format(
      'CREATE POLICY "Service role full access" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      _tbl
    );
  END LOOP;
END
$$;

-- ── Tenants table: RLS uses `id` not `tenant_id` ─────────────────

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated full access" ON tenants;
DROP POLICY IF EXISTS "Tenant isolation" ON tenants;
CREATE POLICY "Tenant isolation" ON tenants
  FOR ALL TO authenticated
  USING (id = public.current_tenant_id())
  WITH CHECK (id = public.current_tenant_id());
DROP POLICY IF EXISTS "Service role full access" ON tenants;
CREATE POLICY "Service role full access" ON tenants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Ensure gateway_registration_tokens also has the updated policies ─
-- (it had its own policy defined in 006_gateways.sql)

DROP POLICY IF EXISTS gateway_registration_tokens_all ON gateway_registration_tokens;

-- ── JWT trigger: set tenant_id in app_metadata on user creation ────
-- This ensures every new auth user gets the default tenant_id in their
-- JWT. In OSS this is always the default tenant. In hosted, the
-- orchestrator sets the correct tenant_id during provisioning.

CREATE OR REPLACE FUNCTION set_tenant_id_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );

  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('tenant_id', v_tenant_id::text);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenant_id_on_signup ON auth.users;
CREATE TRIGGER set_tenant_id_on_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_signup();

-- Backfill existing auth users with the default tenant_id
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('tenant_id', '00000000-0000-0000-0000-000000000000')
WHERE raw_app_meta_data ->> 'tenant_id' IS NULL;
