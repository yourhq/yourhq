-- 003_shared_functions.sql — Utility functions used across multiple tables.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

GRANT EXECUTE ON FUNCTION current_tenant_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION is_valid_timezone(tz text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  PERFORM now() AT TIME ZONE tz;
  RETURN true;
EXCEPTION WHEN invalid_parameter_value THEN
  RETURN false;
END;
$$;

-- Schema version tracking (referenced by the UI to check migration state)
CREATE TABLE IF NOT EXISTS _schema_version (
  version     integer PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  description text
);
ALTER TABLE _schema_version DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON _schema_version TO authenticated, service_role;

INSERT INTO _schema_version (version, description)
VALUES (25, 'Consolidated schema v25 — full platform')
ON CONFLICT (version) DO NOTHING;
