-- 038_gateway_backups.sql — Storage bucket + metadata for gateway state backups.

-- ── Storage bucket ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('gateway-backups', 'gateway-backups', false)
ON CONFLICT (id) DO NOTHING;

-- Only service_role can access backups (gateways use the service role key).
-- The global service_role policy from 017 already covers this, but we add
-- an explicit one scoped to this bucket for clarity.
DROP POLICY IF EXISTS "Gateway backup service access" ON storage.objects;
CREATE POLICY "Gateway backup service access" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'gateway-backups')
  WITH CHECK (bucket_id = 'gateway-backups');

-- ── Backup metadata on gateways table ─────────────────────────────
-- Track last backup time and size so the UI can display backup status
-- without listing storage objects.

ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS last_backup_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_backup_size_bytes bigint;

GRANT SELECT, INSERT, UPDATE ON gateways TO authenticated;
GRANT ALL ON gateways TO service_role;

-- ── command_action enum extension ─────────────────────────────────
-- Add backup_gateway to the allowed actions. The enum lives as a CHECK
-- constraint on agent_commands.action — we need to update it.
-- (The column is text with no enum type, so no ALTER TYPE needed.)
