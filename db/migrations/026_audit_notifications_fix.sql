-- ── Add missing columns referenced by UI code ──────────────────────

-- audit_log: the UI writes a `changes` JSONB diff on update actions.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS changes jsonb;

-- notifications: the UI queries/updates `is_read` (boolean) rather than
-- computing it from `read_at IS NULL`. Add the column with a default
-- and backfill from existing data.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

UPDATE notifications SET is_read = true WHERE read_at IS NOT NULL AND is_read = false;

-- Grant
GRANT SELECT, INSERT, UPDATE ON audit_log TO authenticated;
GRANT ALL ON audit_log TO service_role;
GRANT SELECT, INSERT, UPDATE ON notifications TO authenticated;
GRANT ALL ON notifications TO service_role;
