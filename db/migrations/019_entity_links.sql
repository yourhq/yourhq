-- 019_entity_links.sql — Universal polymorphic linking table.

-- ── entity_links table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS entity_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  tenant_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'
                  REFERENCES tenants(id) ON DELETE CASCADE,
  owner_type    text NOT NULL,
  owner_id      uuid NOT NULL,
  target_type   text NOT NULL,
  target_id     uuid,
  url           text,
  label         text,
  sort_order    integer DEFAULT 0,
  meta          jsonb NOT NULL DEFAULT '{}',
  is_deliverable          boolean NOT NULL DEFAULT false,
  review_status           text CHECK (review_status IS NULL OR review_status IN (
    'draft', 'in_review', 'approved', 'revision_requested', 'rejected'
  )),
  review_note             text,
  reviewed_by             uuid,
  reviewed_at             timestamptz,
  submitted_by_agent_id   uuid REFERENCES agents(id) ON DELETE SET NULL,
  CONSTRAINT entity_links_target_check CHECK (
    (target_type = 'url' AND url IS NOT NULL AND target_id IS NULL) OR
    (target_type != 'url' AND target_id IS NOT NULL AND url IS NULL)
  ),
  CONSTRAINT entity_links_unique UNIQUE (owner_type, owner_id, target_type, target_id)
);

DROP INDEX IF EXISTS idx_entity_links_owner;
CREATE INDEX IF NOT EXISTS idx_entity_links_owner
  ON entity_links (tenant_id, owner_type, owner_id);

CREATE INDEX IF NOT EXISTS idx_entity_links_target
  ON entity_links(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_entity_links_tenant
  ON entity_links(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS entity_links_url_unique
  ON entity_links(owner_type, owner_id, url) WHERE target_type = 'url';

DROP TRIGGER IF EXISTS entity_links_updated_at ON entity_links;
CREATE TRIGGER entity_links_updated_at
  BEFORE UPDATE ON entity_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────

ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation" ON entity_links;
CREATE POLICY "Tenant isolation" ON entity_links
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "Service role full access" ON entity_links;
CREATE POLICY "Service role full access" ON entity_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Realtime ───────────────────────────────────────────────────────

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE entity_links;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE entity_links REPLICA IDENTITY FULL;

-- ── Deliverable index ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_entity_links_deliverables
  ON entity_links(owner_type, owner_id) WHERE is_deliverable = true;

CREATE INDEX IF NOT EXISTS idx_entity_links_submitted_by
  ON entity_links(submitted_by_agent_id) WHERE submitted_by_agent_id IS NOT NULL;

-- ── Notify agent when deliverable needs revision ──────────────────

CREATE OR REPLACE FUNCTION notify_deliverable_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent RECORD;
  v_dedup_key text;
BEGIN
  IF NEW.is_deliverable = false OR NEW.submitted_by_agent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.review_status IS DISTINCT FROM NEW.review_status
     AND NEW.review_status IN ('revision_requested', 'rejected') THEN
    SELECT id, slug, tenant_id INTO v_agent
    FROM public.agents WHERE id = NEW.submitted_by_agent_id;

    IF v_agent.id IS NOT NULL THEN
      v_dedup_key := 'deliverable_review:' || NEW.id || ':' || NEW.review_status || ':' || now()::date;

      INSERT INTO public.agent_inbox_items (
        agent_id, agent_slug, event_type, task_id,
        summary, dedup_key, context, tenant_id
      ) VALUES (
        v_agent.id,
        v_agent.slug,
        'deliverable_review',
        CASE WHEN NEW.owner_type = 'task' THEN NEW.owner_id ELSE NULL END,
        CASE
          WHEN NEW.review_status = 'revision_requested'
            THEN 'Revision requested on deliverable: ' || COALESCE(NEW.label, 'Untitled')
          ELSE 'Deliverable rejected: ' || COALESCE(NEW.label, 'Untitled')
        END,
        v_dedup_key,
        jsonb_build_object(
          'deliverable_id', NEW.id,
          'deliverable_label', NEW.label,
          'review_status', NEW.review_status,
          'review_note', NEW.review_note
        ),
        v_agent.tenant_id
      ) ON CONFLICT ON CONSTRAINT uq_inbox_dedup DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_links_deliverable_review ON entity_links;
CREATE TRIGGER entity_links_deliverable_review
  AFTER UPDATE OF review_status ON entity_links
  FOR EACH ROW EXECUTE FUNCTION notify_deliverable_review();

-- ── Grants ─────────────────────────────────────────────────────────

GRANT ALL ON entity_links TO authenticated, service_role;
