-- 011_comments.sql — Polymorphic comments.

CREATE TABLE IF NOT EXISTS comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000' REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type     text NOT NULL,
  entity_id       uuid NOT NULL,
  parent_id       uuid REFERENCES comments(id) ON DELETE CASCADE,
  body            text NOT NULL,
  actor_type      actor_type NOT NULL DEFAULT 'human',
  actor_agent_id  uuid REFERENCES agents(id) ON DELETE SET NULL,
  mentions        text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_comments_tenant ON comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_actor ON comments(actor_type, actor_agent_id);

DROP TRIGGER IF EXISTS comments_updated_at ON comments;
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Trigger: enqueue inbox items for @mentioned agents ────────────

CREATE OR REPLACE FUNCTION enqueue_comment_mentions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_mention text;
  v_agent_record RECORD;
  v_dedup_key text;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH v_mention IN ARRAY NEW.mentions LOOP
    v_mention := ltrim(v_mention, '@');
    SELECT id, slug, tenant_id INTO v_agent_record FROM public.agents WHERE slug = v_mention;
    IF v_agent_record.id IS NULL THEN CONTINUE; END IF;
    IF NEW.actor_agent_id = v_agent_record.id THEN CONTINUE; END IF;

    v_dedup_key := 'comment_mention:' || NEW.id || ':' || v_agent_record.id;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type, task_id, comment_id, summary, dedup_key, context, tenant_id
    ) VALUES (
      v_agent_record.id, v_agent_record.slug, 'task_comment_mention',
      CASE WHEN NEW.entity_type = 'task' THEN NEW.entity_id ELSE NULL END,
      NEW.id,
      '@' || v_agent_record.slug || ' mentioned in comment', v_dedup_key,
      jsonb_build_object(
        'comment_body', left(NEW.body, 500),
        'entity_type', NEW.entity_type, 'entity_id', NEW.entity_id,
        'actor_type', NEW.actor_type, 'actor_agent_id', NEW.actor_agent_id
      ),
      v_agent_record.tenant_id
    ) ON CONFLICT (dedup_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_enqueue_mentions ON comments;
CREATE TRIGGER comments_enqueue_mentions
  AFTER INSERT ON comments
  FOR EACH ROW
  WHEN (NEW.mentions IS NOT NULL AND array_length(NEW.mentions, 1) IS NOT NULL)
  EXECUTE FUNCTION enqueue_comment_mentions();

-- ── RLS ───────────────────────────────────────────────────────────

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON comments
  FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY "Service role full access" ON comments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON comments TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION enqueue_comment_mentions() TO authenticated, service_role;

-- ── Trigger: notify human when an agent posts a comment ───────────

CREATE OR REPLACE FUNCTION notify_agent_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent_name text;
  v_title text;
BEGIN
  IF NEW.actor_type != 'agent' THEN RETURN NEW; END IF;

  SELECT name INTO v_agent_name FROM public.agents WHERE id = NEW.actor_agent_id;

  IF NEW.entity_type = 'task' THEN
    SELECT title INTO v_title FROM public.tasks WHERE id = NEW.entity_id;
  END IF;

  INSERT INTO public.notifications (tenant_id, type, title, body, entity_type, entity_id, actor_type, actor_agent_id, meta)
  VALUES (
    NEW.tenant_id, 'agent_comment',
    COALESCE(v_agent_name, 'Agent') || ' commented',
    left(NEW.body, 200),
    NEW.entity_type, NEW.entity_id, 'agent', NEW.actor_agent_id,
    jsonb_build_object('comment_id', NEW.id, 'entity_title', v_title)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_notify_agent ON comments;
CREATE TRIGGER comments_notify_agent
  AFTER INSERT ON comments
  FOR EACH ROW
  WHEN (NEW.actor_type = 'agent')
  EXECUTE FUNCTION notify_agent_comment();

GRANT EXECUTE ON FUNCTION notify_agent_comment() TO authenticated, service_role;

-- ── Realtime ──────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE comments REPLICA IDENTITY FULL;
