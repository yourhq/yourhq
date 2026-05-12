-- Allow interactions to exist at org level without a specific contact.
-- contact_id or org_id (or both) must be set.

ALTER TABLE interactions ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE interactions ADD CONSTRAINT interactions_has_owner
  CHECK (contact_id IS NOT NULL OR org_id IS NOT NULL);

-- Index for org-scoped interaction lookups
CREATE INDEX IF NOT EXISTS idx_interactions_org_occurred
  ON interactions (org_id, occurred_at DESC)
  WHERE org_id IS NOT NULL;

-- Grants
GRANT SELECT ON interactions TO authenticated;
GRANT ALL ON interactions TO service_role;
