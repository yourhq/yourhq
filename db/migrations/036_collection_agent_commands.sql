-- 036: Add collection command actions for agent integration
-- Agents can list collections, query records, and create/update records.

ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'collection_list';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'collection_query';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'collection_record_create';
ALTER TYPE command_action ADD VALUE IF NOT EXISTS 'collection_record_update';
