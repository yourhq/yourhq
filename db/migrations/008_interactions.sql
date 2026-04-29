-- 008_interactions.sql — Contact interaction timeline.

CREATE TABLE IF NOT EXISTS interactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id          uuid REFERENCES organizations(id) ON DELETE SET NULL,
  type            text NOT NULL,
  direction       text,
  channel         text,
  subject         text,
  summary         text,
  body            text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  next_action     text,
  next_action_date timestamptz,
  template_id     uuid REFERENCES templates(id) ON DELETE SET NULL,
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  meta            jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for interactions
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS channel text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS next_action text;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS next_action_date timestamptz;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS template_id uuid;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS actor_type actor_type NOT NULL DEFAULT 'human';
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS actor_agent_id uuid;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_occurred ON interactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);
CREATE INDEX IF NOT EXISTS idx_interactions_next_action ON interactions(next_action_date ASC NULLS LAST)
  WHERE next_action_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_actor ON interactions(actor_type, actor_agent_id);
CREATE INDEX IF NOT EXISTS idx_interactions_org ON interactions(org_id);

-- Trigger: sync contact last_contact_date on new interaction
CREATE OR REPLACE FUNCTION sync_contact_last_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.contacts
  SET last_contact_date = GREATEST(last_contact_date, NEW.occurred_at)
  WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interactions_sync_contact ON interactions;
CREATE TRIGGER interactions_sync_contact
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION sync_contact_last_interaction();

-- Trigger: increment template use_count
CREATE OR REPLACE FUNCTION increment_template_use()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.template_id IS NOT NULL THEN
    UPDATE public.templates
    SET use_count = use_count + 1
    WHERE id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS interactions_template_use ON interactions;
CREATE TRIGGER interactions_template_use
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION increment_template_use();
