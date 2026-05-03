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

