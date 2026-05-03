-- 004_tenants.sql — Multi-tenancy foundation.
--
-- OSS: single default tenant (trivially satisfied).
-- Hosted: one tenant per workspace, RLS via current_tenant_id() JWT claim.

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

-- RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON tenants
  FOR ALL TO authenticated
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());
CREATE POLICY "Service role full access" ON tenants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE tenants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE tenants REPLICA IDENTITY FULL;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO authenticated, service_role;

-- JWT trigger: set tenant_id in app_metadata on user creation
CREATE OR REPLACE FUNCTION set_tenant_id_on_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
