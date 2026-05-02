-- 030_modular_workspace.sql — Workspace modules for modular onboarding.
--
-- Adds a 'modules' key to workspace.settings JSONB with defaults.
-- CRM module defaults to enabled for existing workspaces.

UPDATE workspace
SET settings = settings || '{"modules": {"crm": true}}'::jsonb
WHERE NOT (settings ? 'modules');

-- ── Schema version ────────────────────────────────────────────────

INSERT INTO _schema_version (version) VALUES (30)
ON CONFLICT (version) DO NOTHING;
