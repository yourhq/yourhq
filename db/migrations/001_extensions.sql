-- 001_extensions.sql — Required Postgres extensions and schema-level grants.

CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Newer Supabase projects revoke public schema access by default.
-- Grant it explicitly so authenticated/anon roles can reach tables and functions.
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT CREATE ON SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated, service_role;
