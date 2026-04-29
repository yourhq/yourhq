-- 013_agent_inbox.sql — Agent inbox queue, triggers, and automation rules.

CREATE TABLE IF NOT EXISTS agent_inbox_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  agent_id              uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_slug            text NOT NULL,
  event_type            inbox_event_type NOT NULL,
  task_id               uuid REFERENCES tasks(id) ON DELETE CASCADE,
  comment_id            uuid REFERENCES comments(id) ON DELETE CASCADE,
  contact_id            uuid REFERENCES contacts(id) ON DELETE CASCADE,
  status                inbox_item_status NOT NULL DEFAULT 'pending',
  leased_at             timestamptz,
  leased_until          timestamptz,
  completed_at          timestamptz,
  failed_at             timestamptz,
  attempt_count         integer NOT NULL DEFAULT 0,
  max_attempts          integer NOT NULL DEFAULT 3,
  summary               text,
  context               jsonb NOT NULL DEFAULT '{}',
  last_wake_attempt_at  timestamptz,
  last_wake_success_at  timestamptz,
  dedup_key             text NOT NULL,
  CONSTRAINT uq_inbox_dedup UNIQUE (dedup_key)
);

-- Column reconciliation for agent_inbox_items
ALTER TABLE agent_inbox_items ADD COLUMN IF NOT EXISTS last_wake_attempt_at timestamptz;
ALTER TABLE agent_inbox_items ADD COLUMN IF NOT EXISTS last_wake_success_at timestamptz;
ALTER TABLE agent_inbox_items ADD COLUMN IF NOT EXISTS dedup_key text;

CREATE INDEX IF NOT EXISTS idx_inbox_agent_status ON agent_inbox_items(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_agent_pending ON agent_inbox_items(agent_id, status, created_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_inbox_status ON agent_inbox_items(status);
CREATE INDEX IF NOT EXISTS idx_inbox_leased ON agent_inbox_items(leased_until) WHERE status = 'leased';
CREATE INDEX IF NOT EXISTS idx_inbox_task ON agent_inbox_items(task_id);
CREATE INDEX IF NOT EXISTS idx_inbox_contact ON agent_inbox_items(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_created ON agent_inbox_items(created_at DESC);

DROP TRIGGER IF EXISTS inbox_items_updated_at ON agent_inbox_items;
CREATE TRIGGER inbox_items_updated_at
  BEFORE UPDATE ON agent_inbox_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lease next pending item (atomic, row-locked)
CREATE OR REPLACE FUNCTION lease_inbox_item(
  p_agent_id uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS SETOF agent_inbox_items
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.agent_inbox_items
  SET
    status = 'leased',
    leased_at = now(),
    leased_until = now() + (p_lease_seconds || ' seconds')::interval,
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = (
    SELECT id FROM public.agent_inbox_items
    WHERE agent_id = p_agent_id
      AND attempt_count < max_attempts
      AND (
        status = 'pending'
        OR (status = 'leased' AND leased_until < now())
        OR status = 'failed'
      )
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

-- Complete an inbox item
CREATE OR REPLACE FUNCTION complete_inbox_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.agent_inbox_items
  SET status = 'done', completed_at = now(), updated_at = now()
  WHERE id = p_item_id;
END;
$$;

-- Fail an inbox item (promotes to dead_letter after max_attempts)
CREATE OR REPLACE FUNCTION fail_inbox_item(p_item_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item public.agent_inbox_items;
BEGIN
  SELECT * INTO v_item FROM public.agent_inbox_items WHERE id = p_item_id;
  IF v_item.attempt_count >= v_item.max_attempts THEN
    UPDATE public.agent_inbox_items
    SET status = 'dead_letter', failed_at = now(), updated_at = now(),
        context = context || jsonb_build_object('last_failure_reason', p_reason)
    WHERE id = p_item_id;
  ELSE
    UPDATE public.agent_inbox_items
    SET status = 'failed', failed_at = now(), updated_at = now(),
        context = context || jsonb_build_object('last_failure_reason', p_reason)
    WHERE id = p_item_id;
  END IF;
END;
$$;

-- ── Inbox triggers ──────────────────────────────────────────────

-- Auto-enqueue on task assignment
CREATE OR REPLACE FUNCTION enqueue_task_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_agent_slug text;
  v_dedup_key text;
BEGIN
  IF NEW.assignee_agent_id IS NULL THEN RETURN NEW; END IF;

  SELECT slug INTO v_agent_slug FROM public.agents WHERE id = NEW.assignee_agent_id;
  IF v_agent_slug IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' OR OLD.assignee_agent_id IS NULL OR OLD.assignee_agent_id != NEW.assignee_agent_id THEN
    IF OLD IS NOT NULL AND OLD.assignee_agent_id IS NOT NULL AND OLD.assignee_agent_id != NEW.assignee_agent_id THEN
      v_dedup_key := 'task_reassignment:' || NEW.id || ':' || NEW.assignee_agent_id;
      INSERT INTO public.agent_inbox_items (agent_id, agent_slug, event_type, task_id, summary, dedup_key, context)
      VALUES (
        NEW.assignee_agent_id, v_agent_slug, 'task_reassignment', NEW.id,
        'Task reassigned: ' || COALESCE(NEW.title, 'Untitled'), v_dedup_key,
        jsonb_build_object('task_title', NEW.title, 'task_status', NEW.status,
          'task_priority', NEW.priority, 'previous_agent_id', OLD.assignee_agent_id)
      ) ON CONFLICT (dedup_key) DO NOTHING;
    ELSE
      v_dedup_key := 'task_assignment:' || NEW.id || ':' || NEW.assignee_agent_id;
      INSERT INTO public.agent_inbox_items (agent_id, agent_slug, event_type, task_id, summary, dedup_key, context)
      VALUES (
        NEW.assignee_agent_id, v_agent_slug, 'task_assignment', NEW.id,
        'Task assigned: ' || COALESCE(NEW.title, 'Untitled'), v_dedup_key,
        jsonb_build_object('task_title', NEW.title, 'task_status', NEW.status, 'task_priority', NEW.priority)
      ) ON CONFLICT (dedup_key) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enqueue_assignment ON tasks;
CREATE TRIGGER tasks_enqueue_assignment
  AFTER INSERT OR UPDATE OF assignee_agent_id ON tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_task_assignment();

-- Auto-enqueue on comment @mentions (polymorphic)
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
    SELECT id, slug INTO v_agent_record FROM public.agents WHERE slug = v_mention;
    IF v_agent_record.id IS NULL THEN CONTINUE; END IF;
    IF NEW.actor_agent_id = v_agent_record.id THEN CONTINUE; END IF;

    v_dedup_key := 'comment_mention:' || NEW.id || ':' || v_agent_record.id;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type, task_id, comment_id, summary, dedup_key, context
    ) VALUES (
      v_agent_record.id, v_agent_record.slug, 'task_comment_mention',
      CASE WHEN NEW.entity_type = 'task' THEN NEW.entity_id ELSE NULL END,
      NEW.id,
      '@' || v_agent_record.slug || ' mentioned in comment', v_dedup_key,
      jsonb_build_object(
        'comment_body', left(NEW.body, 500),
        'entity_type', NEW.entity_type, 'entity_id', NEW.entity_id,
        'actor_type', NEW.actor_type, 'actor_agent_id', NEW.actor_agent_id
      )
    ) ON CONFLICT (dedup_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_enqueue_mentions ON comments;
CREATE TRIGGER comments_enqueue_mentions
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION enqueue_comment_mentions();

-- ── Automation rules ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS automation_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  table_name        text NOT NULL,
  field             text,
  condition         automation_condition NOT NULL,
  value             text,
  target_agent_id   uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  target_agent_slug text NOT NULL,
  event_type        inbox_event_type NOT NULL,
  summary_template  text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  meta              jsonb NOT NULL DEFAULT '{}'
);

-- Column reconciliation for automation_rules
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_automation_rules_table ON automation_rules(table_name);
CREATE INDEX IF NOT EXISTS idx_automation_rules_active ON automation_rules(table_name, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_automation_rules_agent ON automation_rules(target_agent_id);

DROP TRIGGER IF EXISTS automation_rules_updated_at ON automation_rules;
CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contact automation trigger (with JSONB extended field fallback)
CREATE OR REPLACE FUNCTION process_contact_automation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_rule RECORD;
  v_dedup_key text;
  v_summary text;
  v_old_value text;
  v_new_value text;
BEGIN
  FOR v_rule IN
    SELECT * FROM public.automation_rules
    WHERE table_name = 'contacts' AND is_active = true
  LOOP

    IF v_rule.condition = 'created' THEN
      IF TG_OP != 'INSERT' THEN CONTINUE; END IF;
      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':created';
      v_summary := replace(
        replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
        '{new_value}', ''
      );

    ELSIF v_rule.condition = 'changed_to' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_new_value IS NULL OR v_new_value != v_rule.value OR v_old_value = v_new_value THEN
        CONTINUE;
      END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':' || COALESCE(v_new_value, 'null') || ':' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    ELSIF v_rule.condition = 'changed_from' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_old_value IS NULL OR v_old_value != v_rule.value OR v_old_value = v_new_value THEN
        CONTINUE;
      END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':from_' || COALESCE(v_old_value, 'null') || ':' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    ELSIF v_rule.condition = 'any_change' THEN
      IF TG_OP != 'UPDATE' OR v_rule.field IS NULL THEN CONTINUE; END IF;

      v_old_value := CASE v_rule.field
        WHEN 'status' THEN OLD.status
        WHEN 'priority' THEN OLD.priority
        WHEN 'relationship_strength' THEN OLD.relationship_strength
        ELSE OLD.extended ->> v_rule.field
      END;
      v_new_value := CASE v_rule.field
        WHEN 'status' THEN NEW.status
        WHEN 'priority' THEN NEW.priority
        WHEN 'relationship_strength' THEN NEW.relationship_strength
        ELSE NEW.extended ->> v_rule.field
      END;

      IF v_old_value = v_new_value THEN CONTINUE; END IF;

      v_dedup_key := 'automation:' || v_rule.id || ':' || NEW.id || ':any_' || now()::text;
      v_summary := replace(
        replace(
          replace(v_rule.summary_template, '{name}', COALESCE(NEW.name, 'Unknown')),
          '{new_value}', COALESCE(v_new_value, '')
        ),
        '{old_value}', COALESCE(v_old_value, '')
      );

    END IF;

    INSERT INTO public.agent_inbox_items (
      agent_id, agent_slug, event_type,
      contact_id, summary, dedup_key, context
    ) VALUES (
      v_rule.target_agent_id, v_rule.target_agent_slug,
      v_rule.event_type, NEW.id, v_summary, v_dedup_key,
      jsonb_build_object(
        'rule_id', v_rule.id, 'table', 'contacts',
        'field', v_rule.field, 'condition', v_rule.condition::text,
        'old_value', v_old_value, 'new_value', v_new_value,
        'contact_name', NEW.name, 'contact_status', NEW.status
      )
    ) ON CONFLICT (dedup_key) DO NOTHING;

  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_automation ON contacts;
CREATE TRIGGER contacts_automation
  AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION process_contact_automation();
