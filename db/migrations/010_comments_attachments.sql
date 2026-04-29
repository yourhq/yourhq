-- 010_comments_attachments.sql — Polymorphic comments and task attachments.

CREATE TABLE IF NOT EXISTS comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  parent_id       uuid REFERENCES comments(id) ON DELETE CASCADE,
  body            text NOT NULL,
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  mentions        text[] NOT NULL DEFAULT '{}'
);

-- Column reconciliation for comments
ALTER TABLE comments ADD COLUMN IF NOT EXISTS mentions text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_actor ON comments(actor_type, actor_agent_id);

DROP TRIGGER IF EXISTS comments_updated_at ON comments;
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Task attachments ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,
  entity_id     uuid,
  url           text,
  label         text,
  CONSTRAINT task_attachments_entity_check
    CHECK (
      (entity_type IN ('document', 'asset') AND entity_id IS NOT NULL AND url IS NULL) OR
      (entity_type = 'url' AND url IS NOT NULL AND entity_id IS NULL)
    ),
  CONSTRAINT task_attachments_unique_entity
    UNIQUE (task_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

DROP TRIGGER IF EXISTS task_attachments_updated_at ON task_attachments;
CREATE TRIGGER task_attachments_updated_at
  BEFORE UPDATE ON task_attachments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sync parent task updated_at on attachment changes
CREATE OR REPLACE FUNCTION sync_task_attachment_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tasks SET updated_at = now()
  WHERE id = coalesce(NEW.task_id, OLD.task_id);
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS task_attachments_sync_parent ON task_attachments;
CREATE TRIGGER task_attachments_sync_parent
  AFTER INSERT OR DELETE ON task_attachments
  FOR EACH ROW EXECUTE FUNCTION sync_task_attachment_updated();
