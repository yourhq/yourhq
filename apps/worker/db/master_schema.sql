-- Master Supabase schema for the hosted offering.
-- This database tracks users, workspaces, and sandbox state.
-- Each workspace maps to a dedicated tenant Supabase project + E2B sandbox.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per human. Handles login routing + Stripe customer mapping.
CREATE TABLE IF NOT EXISTS hosted_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  display_name text,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per billable workspace. A user can have many.
-- Each workspace = one Supabase project + one E2B sandbox.
CREATE TABLE IF NOT EXISTS hosted_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES hosted_users(id) ON DELETE CASCADE,
  label text NOT NULL,
  emoji text,

  -- Stripe
  stripe_subscription_id text,
  subscription_status text NOT NULL DEFAULT 'pending'
    CHECK (subscription_status IN ('pending', 'provisioning', 'active', 'canceling', 'canceled')),

  -- Tenant Supabase project
  supabase_project_ref text,
  supabase_url text,
  supabase_anon_key text,
  supabase_service_role_key_enc text,
  supabase_db_password_enc text,

  -- E2B sandbox
  e2b_sandbox_id text,
  e2b_sandbox_status text NOT NULL DEFAULT 'none'
    CHECK (e2b_sandbox_status IN ('none', 'provisioning', 'running', 'paused', 'error')),
  e2b_access_token text,
  novnc_url text,

  -- VNC
  vnc_password_enc text,

  -- Setup metadata from signup (ownerName, contextPreset, etc.)
  setup_metadata jsonb NOT NULL DEFAULT '{}',

  -- Provisioning progress
  provision_stage text,
  provision_error text,

  -- Cancellation
  cancel_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hosted_workspaces_user ON hosted_workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_hosted_workspaces_status ON hosted_workspaces(subscription_status);

-- Idempotency keys for webhook/provisioning dedup.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

-- Audit log for sandbox lifecycle events.
CREATE TABLE IF NOT EXISTS sandbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES hosted_workspaces(id) ON DELETE CASCADE,
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_events_workspace ON sandbox_events(workspace_id, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER hosted_users_updated_at
  BEFORE UPDATE ON hosted_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER hosted_workspaces_updated_at
  BEFORE UPDATE ON hosted_workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();
