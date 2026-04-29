-- 002_enums.sql — Shared enum types used across multiple tables.

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'cancelled', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE stream_type AS ENUM ('functional', 'project', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE actor_type AS ENUM ('human', 'agent', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'created', 'updated', 'deleted', 'archived',
    'status_changed', 'assigned', 'commented',
    'uploaded', 'moved', 'restored'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE agent_status AS ENUM ('online', 'offline', 'error', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE asset_type AS ENUM (
    'document', 'sop', 'research', 'image', 'video', 'audio',
    'template', 'script', 'spreadsheet', 'link', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE inbox_item_status AS ENUM ('pending', 'leased', 'done', 'failed', 'dead_letter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE inbox_event_type AS ENUM (
    'task_assignment', 'task_reassignment', 'task_comment_mention',
    'contact_created', 'contact_status_changed', 'contact_updated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE automation_condition AS ENUM ('created', 'changed_to', 'changed_from', 'any_change');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
