-- 002_enums.sql — Shared enum types used across multiple tables.

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'cancelled', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE stream_type AS ENUM ('functional', 'geographic', 'channel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE actor_type AS ENUM ('human', 'agent', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'created', 'updated', 'deleted', 'archived',
    'status_changed', 'assigned', 'commented', 'attached', 'sent'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('ready', 'paused', 'error', 'provisioning', 'hibernating');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE budget_status AS ENUM ('ok', 'warned', 'exceeded', 'unmetered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM ('file', 'image', 'link');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inbox_item_status AS ENUM ('pending', 'leased', 'done', 'dead_letter', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inbox_event_type AS ENUM (
    'task_assignment', 'task_reassignment', 'task_comment_mention',
    'routine_schedule', 'routine_event', 'heartbeat',
    'deliverable_review', 'blocker_resolved'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE automation_condition AS ENUM ('created', 'changed_to', 'changed_from', 'any_change');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_relation_type AS ENUM (
    'blocks', 'blocked_by', 'relates_to', 'parent_of', 'child_of'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE work_product_status AS ENUM ('draft', 'in_review', 'approved', 'revision_requested', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE command_action AS ENUM (
    'start_session', 'end_session', 'restart_session', 'refresh_session',
    'execute_prompt', 'send_message', 'send_keys', 'take_screenshot',
    'run_shell', 'upload_file', 'extract_text',
    'provision', 'approve_pairing', 'update', 'remove',
    'restart_gateway', 'update_all', 'restart_dispatcher', 'update_gateway',
    'auth_set_api_key', 'auth_start', 'auth_paste',
    'auth_list', 'auth_remove', 'auth_refresh', 'auth_set_default',
    'set_agent_model', 'list_models', 'source_write'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE command_status AS ENUM ('pending', 'leased', 'running', 'done', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gateway_status AS ENUM ('provisioning', 'ready', 'error', 'hibernating');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plugin_source AS ENUM ('builtin', 'local', 'webhook', 'marketplace');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plugin_event_status AS ENUM ('success', 'error', 'timeout', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
