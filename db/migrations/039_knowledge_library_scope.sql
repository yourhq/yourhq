-- 039_knowledge_library_scope.sql — Add 'library' scope, remove 'pinned' column.
--
-- Scope semantics:
--   workspace — injected in full into every agent's boot context
--   agent     — index-only in assigned agents' boot context, fetched on demand
--   library   — not in boot context; searchable and fetchable on demand

-- 1. Widen the scope CHECK constraint to include 'library'.
ALTER TABLE knowledge_items DROP CONSTRAINT IF EXISTS knowledge_items_scope_check;
ALTER TABLE knowledge_items ADD CONSTRAINT knowledge_items_scope_check
  CHECK (scope IN ('workspace', 'agent', 'library'));

-- 2. Migrate existing unpinned workspace items to library scope.
--    Pinned workspace items stay as workspace (they were the ones injected at boot).
UPDATE knowledge_items
   SET scope = 'library'
 WHERE scope = 'workspace'
   AND (pinned IS NULL OR pinned = false);

-- 3. Drop the pinned column and its indexes.
DROP INDEX IF EXISTS idx_knowledge_items_pinned;

ALTER TABLE knowledge_items DROP COLUMN IF EXISTS pinned;

-- 4. Rebuild the browse composite index without pinned.
DROP INDEX IF EXISTS idx_knowledge_items_browse;
CREATE INDEX IF NOT EXISTS idx_knowledge_items_browse
  ON knowledge_items(tenant_id, kind, updated_at DESC)
  WHERE archived_at IS NULL;

GRANT ALL ON knowledge_items TO authenticated, service_role;
