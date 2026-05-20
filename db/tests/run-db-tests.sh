#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/db/migrations"

DB_URL="${TEST_DATABASE_URL:-}"

if [[ -z "$DB_URL" ]]; then
  echo "TEST_DATABASE_URL not set — trying localhost default"
  DB_URL="postgresql://postgres:postgres@localhost:5432/hq_test"
fi

# Color output (disable in non-TTY for CI log readability)
if [[ -t 1 ]]; then
  GREEN='\033[0;32m' RED='\033[0;31m' NC='\033[0m'
else
  GREEN='' RED='' NC=''
fi

wait_for_postgres() {
  local max_wait=30 elapsed=0
  echo "Waiting for Postgres..."
  while ! pg_isready -d "$DB_URL" -q 2>/dev/null; do
    elapsed=$((elapsed + 1))
    if [[ $elapsed -ge $max_wait ]]; then
      echo "Postgres not ready after ${max_wait}s — aborting"
      exit 1
    fi
    sleep 1
  done
  echo "Postgres ready (${elapsed}s)"
}

PASSED=0
FAILED=0
ERRORS=""

run_sql() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A "$@" 2>&1
}

run_sql_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A -c "$1" 2>&1 | head -1
}

pass() {
  PASSED=$((PASSED + 1))
  echo -e "  ${GREEN}[pass]${NC} $1"
}

fail() {
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - $1"
  echo -e "  ${RED}[FAIL]${NC} $1"
}

assert_eq() {
  local actual="$1" expected="$2" msg="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$msg"
  else
    fail "$msg (expected '$expected', got '$actual')"
  fi
}

assert_ge() {
  local actual="$1" expected="$2" msg="$3"
  if [[ "$actual" -ge "$expected" ]]; then
    pass "$msg"
  else
    fail "$msg (expected >= $expected, got $actual)"
  fi
}

# ── Bootstrap: Supabase stubs for plain Postgres ─────────────────────

bootstrap_test_db() {
  echo "==> Bootstrapping test database..."

  psql "$DB_URL" -v ON_ERROR_STOP=0 -X -q <<'BOOTSTRAP'
-- Roles that Supabase creates but plain Postgres lacks
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT authenticated TO CURRENT_USER;
GRANT anon TO CURRENT_USER;
GRANT service_role TO CURRENT_USER;

-- auth schema stub (Supabase manages this in production)
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid,
  role text,
  aud text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}',
  raw_user_meta_data jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
GRANT ALL ON auth.users TO authenticated, service_role;

-- storage schema stub
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
GRANT ALL ON storage.buckets TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.objects TO authenticated, service_role;

-- Supabase-provided helper used by storage RLS policies
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE plpgsql AS $f$
BEGIN
  RETURN string_to_array(name, '/');
END;
$f$;

-- extensions schema stub for pgvector (Supabase includes extensions in search_path)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, anon, service_role, PUBLIC;
ALTER DATABASE hq_test SET search_path TO public, extensions;

-- Realtime publication stub
DO $$ BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- pg_cron stubs (CI Postgres does not have pg_cron)
CREATE SCHEMA IF NOT EXISTS cron;
GRANT USAGE ON SCHEMA cron TO PUBLIC;

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE plpgsql AS $f$
BEGIN RETURN 0; END;
$f$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean LANGUAGE plpgsql AS $f$
BEGIN RETURN true; END;
$f$;
BOOTSTRAP

  echo "  Bootstrap complete."
}

# ── Apply migrations ─────────────────────────────────────────────────

apply_migrations() {
  echo "==> Applying migrations..."
  local count=0
  local migration_failed=0

  for f in "$MIGRATIONS_DIR"/*.sql; do
    local fname
    fname="$(basename "$f")"

    if ! psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -f "$f" > /dev/null 2>&1; then
      echo "  [warn] Migration $fname had errors (may be non-fatal)"
      migration_failed=$((migration_failed + 1))
    fi
    count=$((count + 1))
  done

  echo "  Applied $count migrations ($migration_failed with warnings)."
}

# ═══════════════════════════════════════════════════════════════════════
# Test suites
# ═══════════════════════════════════════════════════════════════════════

test_table_existence() {
  echo "── Table existence ──────────────────────────────────────────"

  local tables=(
    tenants workspace pipeline_stages field_definitions
    tags campaigns contacts organizations contact_organizations
    templates draft_sets
    gateways gateway_registration_tokens
    agents
    interactions
    streams tasks task_series
    comments
    knowledge_folders knowledge_items knowledge_item_agents knowledge_chunks
    audit_log notifications
    agent_inbox_items
    agent_commands
    agent_usage agent_budgets
    entity_links
    routines
    collection_definitions collection_fields collection_records collection_views
    source_connections source_sync_runs
    secrets
    hq_plugins hq_plugin_state hq_plugin_events hq_plugin_event_queue
    task_relations
    labels task_labels
    task_templates
    _schema_version
  )

  for tbl in "${tables[@]}"; do
    local exists
    exists=$(run_sql_value "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$tbl')::text")
    if [[ "$exists" == "true" ]]; then
      pass "table '$tbl' exists"
    else
      fail "table '$tbl' does NOT exist"
    fi
  done
}

test_column_contracts() {
  echo "── Column contracts ─────────────────────────────────────────"

  # shellcheck disable=SC2034
  local check_column
  check_column() {
    local table="$1" column="$2" expected_type="$3"
    local actual
    actual=$(run_sql_value "
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '$table' AND column_name = '$column'
    ")
    if [[ -z "$actual" ]]; then
      fail "$table.$column missing"
    elif [[ "$actual" == "$expected_type" ]]; then
      pass "$table.$column type is '$expected_type'"
    else
      fail "$table.$column type mismatch (expected '$expected_type', got '$actual')"
    fi
  }

  check_column tenants id "uuid"
  check_column tenants name "text"
  check_column tenants slug "text"
  check_column tenants status "text"

  check_column gateways id "uuid"
  check_column gateways tenant_id "uuid"
  check_column gateways slug "text"
  check_column gateways label "text"
  check_column gateways last_heartbeat_at "timestamp with time zone"

  check_column agents id "uuid"
  check_column agents tenant_id "uuid"
  check_column agents gateway_id "uuid"
  check_column agents name "text"
  check_column agents slug "text"
  check_column agents reports_to_id "uuid"
  check_column agents model "text"

  check_column tasks id "uuid"
  check_column tasks tenant_id "uuid"
  check_column tasks title "text"
  check_column tasks assignee_agent_id "uuid"
  check_column tasks due_date "timestamp with time zone"
  check_column tasks series_id "uuid"

  check_column contacts id "uuid"
  check_column contacts tenant_id "uuid"
  check_column contacts name "text"
  check_column contacts email "text"

  check_column knowledge_items id "uuid"
  check_column knowledge_items kind "text"
  check_column knowledge_items scope "text"
  check_column knowledge_items processing_status "text"
  check_column knowledge_items embedding_status "text"
  check_column knowledge_items chunk_status "text"

  check_column agent_commands action "USER-DEFINED"
  check_column agent_commands status "USER-DEFINED"
  check_column agent_commands gateway_id "uuid"

  check_column entity_links owner_type "text"
  check_column entity_links owner_id "uuid"
  check_column entity_links target_type "text"
  check_column entity_links is_deliverable "boolean"
  check_column entity_links review_status "text"

  check_column task_relations source_task_id "uuid"
  check_column task_relations target_task_id "uuid"
  check_column task_relations relation_type "USER-DEFINED"

  check_column secrets key "text"
  check_column secrets encrypted_value "text"
  check_column secrets gateway_id "uuid"
  check_column secrets category "text"

  check_column hq_plugins plugin_id "text"
  check_column hq_plugins hooks "ARRAY"
  check_column hq_plugins source "USER-DEFINED"

  check_column routines trigger_type "text"
  check_column routines agent_id "uuid"
  check_column routines cadence_type "text"
  check_column routines next_run_at "timestamp with time zone"
}

test_rls_enabled() {
  echo "── RLS policies ─────────────────────────────────────────────"

  local rls_tables=(
    tenants workspace gateways agents tasks contacts organizations
    knowledge_items knowledge_folders knowledge_chunks knowledge_item_agents
    agent_commands agent_inbox_items agent_usage agent_budgets
    entity_links routines secrets
    task_relations labels task_labels task_templates
    hq_plugins hq_plugin_state hq_plugin_events hq_plugin_event_queue
    collection_definitions collection_fields collection_records collection_views
    source_connections comments audit_log notifications
    streams task_series campaigns templates draft_sets tags
    interactions contact_organizations
  )

  for tbl in "${rls_tables[@]}"; do
    local rls_on
    rls_on=$(run_sql_value "
      SELECT relrowsecurity::text FROM pg_class
      WHERE relname = '$tbl' AND relnamespace = 'public'::regnamespace
    ")
    if [[ "$rls_on" == "true" ]]; then
      pass "RLS enabled on '$tbl'"
    else
      fail "RLS NOT enabled on '$tbl'"
    fi
  done
}

test_default_gateway_row() {
  echo "── Default gateway row ──────────────────────────────────────"

  local count
  count=$(run_sql_value "SELECT count(*) FROM gateways WHERE slug = 'default'")
  assert_ge "$count" 1 "gateways has a default row (slug='default')"

  local label
  label=$(run_sql_value "SELECT label FROM gateways WHERE slug = 'default' LIMIT 1")
  assert_eq "$label" "Primary gateway" "default gateway label is 'Primary gateway'"
}

test_default_tenant_row() {
  echo "── Default tenant row ───────────────────────────────────────"

  local count
  count=$(run_sql_value "SELECT count(*) FROM tenants WHERE id = '00000000-0000-0000-0000-000000000000'")
  assert_eq "$count" "1" "default tenant exists (all-zeros UUID)"

  local slug
  slug=$(run_sql_value "SELECT slug FROM tenants WHERE id = '00000000-0000-0000-0000-000000000000'")
  assert_eq "$slug" "default" "default tenant slug is 'default'"
}

test_enum_types() {
  echo "── Enum types ───────────────────────────────────────────────"

  # shellcheck disable=SC2034
  local check_enum_values
  check_enum_values() {
    local enum_name="$1"
    shift
    local expected_values=("$@")

    local actual_count
    actual_count=$(run_sql_value "
      SELECT count(*) FROM pg_enum
      WHERE enumtypid = '$enum_name'::regtype
    ")

    if [[ "$actual_count" -eq 0 ]]; then
      fail "enum '$enum_name' has no values"
      return
    fi

    for val in "${expected_values[@]}"; do
      local found
      found=$(run_sql_value "
        SELECT count(*) FROM pg_enum
        WHERE enumtypid = '$enum_name'::regtype AND enumlabel = '$val'
      ")
      if [[ "$found" -eq 1 ]]; then
        pass "enum '$enum_name' has value '$val'"
      else
        fail "enum '$enum_name' missing value '$val'"
      fi
    done
  }

  check_enum_values command_action \
    start_session end_session execute_prompt send_message \
    run_shell provision source_write

  check_enum_values command_status \
    pending leased running "done" failed cancelled

  check_enum_values task_status \
    todo in_progress blocked "done" cancelled missed

  check_enum_values task_priority \
    low medium high urgent

  check_enum_values agent_status \
    ready paused error provisioning hibernating

  check_enum_values gateway_status \
    provisioning ready error hibernating

  check_enum_values task_relation_type \
    blocks blocked_by relates_to parent_of child_of

  check_enum_values plugin_source \
    builtin local webhook marketplace

  check_enum_values inbox_event_type \
    task_assignment routine_schedule routine_event \
    deliverable_review blocker_resolved

  check_enum_values work_product_status \
    draft in_review approved revision_requested rejected

  check_enum_values actor_type \
    human agent system

  check_enum_values audit_action \
    created updated deleted status_changed assigned commented
}

test_foreign_keys() {
  echo "── Foreign keys ─────────────────────────────────────────────"

  # shellcheck disable=SC2034
  local check_fk
  check_fk() {
    local from_table="$1" from_col="$2" to_table="$3" to_col="$4"
    local found
    found=$(run_sql_value "
      SELECT count(*) FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = rc.constraint_name
        AND kcu.constraint_schema = rc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = rc.unique_constraint_name
        AND ccu.constraint_schema = rc.unique_constraint_schema
      WHERE kcu.table_schema = 'public'
        AND kcu.table_name = '$from_table'
        AND kcu.column_name = '$from_col'
        AND ccu.table_name = '$to_table'
        AND ccu.column_name = '$to_col'
    ")
    if [[ "$found" -ge 1 ]]; then
      pass "FK: $from_table.$from_col -> $to_table.$to_col"
    else
      fail "FK missing: $from_table.$from_col -> $to_table.$to_col"
    fi
  }

  check_fk agents gateway_id gateways id
  check_fk agents reports_to_id agents id
  check_fk agents tenant_id tenants id

  check_fk tasks tenant_id tenants id
  check_fk tasks assignee_agent_id agents id
  check_fk tasks stream_id streams id
  check_fk tasks contact_id contacts id
  check_fk tasks series_id task_series id

  check_fk task_relations source_task_id tasks id
  check_fk task_relations target_task_id tasks id
  check_fk task_relations tenant_id tenants id

  check_fk knowledge_items tenant_id tenants id
  check_fk knowledge_items folder_id knowledge_folders id
  check_fk knowledge_chunks knowledge_item_id knowledge_items id

  check_fk agent_commands agent_id agents id
  check_fk agent_commands gateway_id gateways id

  check_fk agent_inbox_items agent_id agents id
  check_fk agent_inbox_items task_id tasks id

  check_fk secrets gateway_id gateways id
  check_fk secrets agent_id agents id

  check_fk entity_links submitted_by_agent_id agents id

  check_fk routines agent_id agents id

  check_fk task_labels task_id tasks id
  check_fk task_labels label_id labels id

  check_fk collection_fields collection_id collection_definitions id
  check_fk collection_records collection_id collection_definitions id
  check_fk collection_views collection_id collection_definitions id

  check_fk source_connections secret_id secrets id
}

test_rpc_existence() {
  echo "── RPC existence ────────────────────────────────────────────"

  local rpcs=(
    current_tenant_id
    set_updated_at
    lease_command
    start_command
    complete_command
    fail_command
    get_task_relations
    search_knowledge_items
    search_knowledge_items_text
    search_knowledge_chunks
    search_knowledge_chunks_text
    lease_knowledge_items_for_indexing
    lease_knowledge_items_for_processing
    mark_knowledge_item_indexed
    mark_knowledge_item_failed
    routine_next_occurrence
    spawn_routine_schedule_items
    escalate_overdue_tasks
    complete_setup
    consume_gateway_token
    get_agent_daily_usage
    agent_reports_chain
    emit_plugin_event
    notify_blocker_resolved
    notify_deliverable_review
    spawn_due_task_instances
  )

  for fn in "${rpcs[@]}"; do
    local found
    found=$(run_sql_value "
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = '$fn'
    ")
    if [[ "$found" -ge 1 ]]; then
      pass "RPC '$fn' exists"
    else
      fail "RPC '$fn' NOT found"
    fi
  done
}

test_lease_command_rpc() {
  echo "── lease_command behavior ───────────────────────────────────"

  local result
  result=$(run_sql_value "
    DO \$\$
    DECLARE
      v_cmd_id uuid;
      v_status text;
    BEGIN
      INSERT INTO agent_commands (action, status, payload)
      VALUES ('run_shell', 'pending', '{\"cmd\": \"echo hi\"}')
      RETURNING id INTO v_cmd_id;

      PERFORM * FROM lease_command(300, 'default');

      SELECT status INTO v_status FROM agent_commands WHERE id = v_cmd_id;
      ASSERT v_status = 'leased',
        format('lease_command should set status to leased, got %s', v_status);

      DELETE FROM agent_commands WHERE id = v_cmd_id;

      RAISE NOTICE 'ok';
    END \$\$;
  " 2>&1)

  if echo "$result" | grep -q "ok"; then
    pass "lease_command sets status to 'leased'"
  else
    fail "lease_command behavior: $result"
  fi
}

test_get_task_relations_rpc() {
  echo "── get_task_relations behavior ──────────────────────────────"

  local result
  result=$(run_sql_value "
    DO \$\$
    DECLARE
      v_gw_id uuid;
      v_agent_id uuid;
      v_task_a uuid;
      v_task_b uuid;
      v_rel_count int;
    BEGIN
      SELECT id INTO v_gw_id FROM gateways WHERE slug = 'default';

      INSERT INTO agents (name, slug, gateway_id) VALUES ('test-rel-agent', 'test-rel-agent', v_gw_id)
      RETURNING id INTO v_agent_id;

      INSERT INTO tasks (title, status) VALUES ('Task A', 'todo') RETURNING id INTO v_task_a;
      INSERT INTO tasks (title, status) VALUES ('Task B', 'in_progress') RETURNING id INTO v_task_b;

      INSERT INTO task_relations (source_task_id, target_task_id, relation_type)
      VALUES (v_task_a, v_task_b, 'blocked_by');

      SELECT count(*) INTO v_rel_count FROM get_task_relations(v_task_a);
      ASSERT v_rel_count >= 1,
        format('get_task_relations should return >= 1 row, got %s', v_rel_count);

      SELECT count(*) INTO v_rel_count FROM get_task_relations(v_task_b);
      ASSERT v_rel_count >= 1,
        format('get_task_relations (reverse) should return >= 1 row, got %s', v_rel_count);

      DELETE FROM task_relations WHERE source_task_id = v_task_a;
      DELETE FROM tasks WHERE id IN (v_task_a, v_task_b);
      DELETE FROM agents WHERE id = v_agent_id;

      RAISE NOTICE 'ok';
    END \$\$;
  " 2>&1)

  if echo "$result" | grep -q "ok"; then
    pass "get_task_relations returns relations in both directions"
  else
    fail "get_task_relations behavior: $result"
  fi
}

test_triggers_exist() {
  echo "── Triggers ─────────────────────────────────────────────────"

  # shellcheck disable=SC2034
  local check_trigger
  check_trigger() {
    local table="$1" trigger_name="$2"
    local found
    found=$(run_sql_value "
      SELECT count(*) FROM information_schema.triggers
      WHERE event_object_schema = 'public'
        AND event_object_table = '$table'
        AND trigger_name = '$trigger_name'
    ")
    if [[ "$found" -ge 1 ]]; then
      pass "trigger '$trigger_name' on '$table'"
    else
      fail "trigger '$trigger_name' NOT found on '$table'"
    fi
  }

  check_trigger tasks tasks_notify_blocker_resolved
  check_trigger tasks plugin_event_task_created
  check_trigger tasks plugin_event_task_completed
  check_trigger tasks plugin_event_task_assigned
  check_trigger agents plugin_event_agent_status
  check_trigger knowledge_items plugin_event_knowledge_created
  check_trigger agent_inbox_items plugin_event_inbox_created
  check_trigger agent_inbox_items plugin_event_inbox_completed
  check_trigger comments plugin_event_comment_created
  check_trigger secrets plugin_event_secret_changed

  check_trigger entity_links entity_links_deliverable_review

  check_trigger contacts contact_routine_trigger
  check_trigger collection_records collection_record_routine_trigger
  check_trigger knowledge_items knowledge_item_routine_trigger
  check_trigger tasks task_routine_trigger

  check_trigger gateways gateways_updated_at
  check_trigger agents agents_updated_at
  check_trigger tasks tasks_updated_at
  check_trigger tasks tasks_sync_completion
  check_trigger knowledge_items knowledge_items_mark_pending
}

test_routine_next_occurrence_rpc() {
  echo "── routine_next_occurrence behavior ─────────────────────────"

  local result
  result=$(run_sql_value "
    SELECT (routine_next_occurrence(
      'daily', NULL, NULL, NULL, '09:00'::time, 'UTC', now()
    ) IS NOT NULL)::text
  ")
  assert_eq "$result" "true" "routine_next_occurrence returns non-null for daily"

  result=$(run_sql_value "
    SELECT (routine_next_occurrence(
      'weekly', NULL, ARRAY[1,3,5]::smallint[], NULL, '10:00'::time, 'UTC', now()
    ) IS NOT NULL)::text
  ")
  assert_eq "$result" "true" "routine_next_occurrence returns non-null for weekly"

  result=$(run_sql_value "
    SELECT (routine_next_occurrence(
      'monthly', NULL, NULL, 15::smallint, '14:00'::time, 'America/New_York', now()
    ) IS NOT NULL)::text
  ")
  assert_eq "$result" "true" "routine_next_occurrence returns non-null for monthly"
}

test_deliverable_auto_complete_trigger() {
  echo "── deliverable auto-complete trigger ────────────────────────"

  local result
  result=$(run_sql_value "
    DO \$\$
    DECLARE
      v_gw_id uuid;
      v_agent_id uuid;
      v_task_id uuid;
      v_del1_id uuid;
      v_del2_id uuid;
      v_task_status text;
      v_inbox_count int;
    BEGIN
      SELECT id INTO v_gw_id FROM gateways WHERE slug = 'default';

      INSERT INTO agents (name, slug, gateway_id)
      VALUES ('del-test-agent', 'del-test-agent', v_gw_id)
      RETURNING id INTO v_agent_id;

      INSERT INTO tasks (title, status)
      VALUES ('Deliverable test task', 'in_progress')
      RETURNING id INTO v_task_id;

      -- Create two deliverables in draft state
      INSERT INTO entity_links (owner_type, owner_id, target_type, label, is_deliverable, review_status, submitted_by_agent_id)
      VALUES ('task', v_task_id, 'url', 'Deliverable 1', true, 'draft', v_agent_id)
      RETURNING id INTO v_del1_id;

      INSERT INTO entity_links (owner_type, owner_id, target_type, label, is_deliverable, review_status, submitted_by_agent_id)
      VALUES ('task', v_task_id, 'url', 'Deliverable 2', true, 'draft', v_agent_id)
      RETURNING id INTO v_del2_id;

      -- Approve first deliverable — task should stay in_progress
      UPDATE entity_links SET review_status = 'approved' WHERE id = v_del1_id;
      SELECT status INTO v_task_status FROM tasks WHERE id = v_task_id;
      ASSERT v_task_status = 'in_progress',
        format('Task should stay in_progress after partial approval, got %s', v_task_status);

      -- Approve second deliverable — task should auto-complete
      UPDATE entity_links SET review_status = 'approved' WHERE id = v_del2_id;
      SELECT status INTO v_task_status FROM tasks WHERE id = v_task_id;
      ASSERT v_task_status = 'done',
        format('Task should be done after all deliverables approved, got %s', v_task_status);

      -- Clean up
      DELETE FROM entity_links WHERE id IN (v_del1_id, v_del2_id);
      DELETE FROM tasks WHERE id = v_task_id;
      DELETE FROM agents WHERE id = v_agent_id;

      RAISE NOTICE 'ok';
    END \$\$;
  " 2>&1)

  if echo "$result" | grep -q "ok"; then
    pass "auto-completes task when all deliverables approved"
  else
    fail "deliverable auto-complete: $result"
  fi

  # Test that revision_requested creates an inbox item
  result=$(run_sql_value "
    DO \$\$
    DECLARE
      v_gw_id uuid;
      v_agent_id uuid;
      v_task_id uuid;
      v_del_id uuid;
      v_inbox_count int;
    BEGIN
      SELECT id INTO v_gw_id FROM gateways WHERE slug = 'default';

      INSERT INTO agents (name, slug, gateway_id)
      VALUES ('del-inbox-agent', 'del-inbox-agent', v_gw_id)
      RETURNING id INTO v_agent_id;

      INSERT INTO tasks (title, status)
      VALUES ('Inbox test task', 'in_progress')
      RETURNING id INTO v_task_id;

      INSERT INTO entity_links (owner_type, owner_id, target_type, label, is_deliverable, review_status, submitted_by_agent_id)
      VALUES ('task', v_task_id, 'url', 'Draft doc', true, 'draft', v_agent_id)
      RETURNING id INTO v_del_id;

      -- Request revision — should create inbox item
      UPDATE entity_links SET review_status = 'revision_requested', review_note = 'Please fix section 2' WHERE id = v_del_id;

      SELECT count(*) INTO v_inbox_count
      FROM agent_inbox_items
      WHERE agent_id = v_agent_id
        AND event_type = 'deliverable_review'
        AND task_id = v_task_id;

      ASSERT v_inbox_count = 1,
        format('Should have 1 inbox item for revision_requested, got %s', v_inbox_count);

      -- Clean up
      DELETE FROM agent_inbox_items WHERE agent_id = v_agent_id;
      DELETE FROM entity_links WHERE id = v_del_id;
      DELETE FROM tasks WHERE id = v_task_id;
      DELETE FROM agents WHERE id = v_agent_id;

      RAISE NOTICE 'ok';
    END \$\$;
  " 2>&1)

  if echo "$result" | grep -q "ok"; then
    pass "revision_requested creates inbox item for agent"
  else
    fail "deliverable inbox notification: $result"
  fi

  # Test that approval does NOT create an inbox item
  result=$(run_sql_value "
    DO \$\$
    DECLARE
      v_gw_id uuid;
      v_agent_id uuid;
      v_task_id uuid;
      v_del_id uuid;
      v_inbox_count int;
    BEGIN
      SELECT id INTO v_gw_id FROM gateways WHERE slug = 'default';

      INSERT INTO agents (name, slug, gateway_id)
      VALUES ('del-no-inbox-agent', 'del-no-inbox-agent', v_gw_id)
      RETURNING id INTO v_agent_id;

      INSERT INTO tasks (title, status)
      VALUES ('No inbox test task', 'in_progress')
      RETURNING id INTO v_task_id;

      INSERT INTO entity_links (owner_type, owner_id, target_type, label, is_deliverable, review_status, submitted_by_agent_id)
      VALUES ('task', v_task_id, 'url', 'Approved doc', true, 'draft', v_agent_id)
      RETURNING id INTO v_del_id;

      -- Approve — should NOT create inbox item
      UPDATE entity_links SET review_status = 'approved' WHERE id = v_del_id;

      SELECT count(*) INTO v_inbox_count
      FROM agent_inbox_items
      WHERE agent_id = v_agent_id AND event_type = 'deliverable_review';

      ASSERT v_inbox_count = 0,
        format('Approval should not create inbox item, got %s', v_inbox_count);

      -- Clean up
      DELETE FROM agent_inbox_items WHERE agent_id = v_agent_id;
      DELETE FROM entity_links WHERE id = v_del_id;
      DELETE FROM tasks WHERE id = v_task_id;
      DELETE FROM agents WHERE id = v_agent_id;

      RAISE NOTICE 'ok';
    END \$\$;
  " 2>&1)

  if echo "$result" | grep -q "ok"; then
    pass "approval does NOT create inbox item (auto-complete only)"
  else
    fail "approval no-inbox check: $result"
  fi
}

test_schema_version() {
  echo "── Schema version ───────────────────────────────────────────"

  local count
  count=$(run_sql_value "SELECT count(*) FROM _schema_version")
  assert_ge "$count" 1 "_schema_version has at least one entry"
}

test_workspace_seed() {
  echo "── Workspace seed ───────────────────────────────────────────"

  local count
  count=$(run_sql_value "SELECT count(*) FROM workspace")
  assert_ge "$count" 1 "workspace has at least one seed row"
}

# ═══════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════

main() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║             HQ Database Contract Tests                       ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo ""

  wait_for_postgres
  bootstrap_test_db
  apply_migrations

  echo ""
  echo "==> Running tests..."
  echo ""

  test_table_existence
  echo ""
  test_column_contracts
  echo ""
  test_rls_enabled
  echo ""
  test_default_tenant_row
  echo ""
  test_default_gateway_row
  echo ""
  test_enum_types
  echo ""
  test_foreign_keys
  echo ""
  test_rpc_existence
  echo ""
  test_lease_command_rpc
  echo ""
  test_get_task_relations_rpc
  echo ""
  test_routine_next_occurrence_rpc
  echo ""
  test_triggers_exist
  echo ""
  test_deliverable_auto_complete_trigger
  echo ""
  test_schema_version
  echo ""
  test_workspace_seed
  echo ""

  echo "═══════════════════════════════════════════════════════════════"
  echo "  Results: $PASSED passed, $FAILED failed"
  echo "═══════════════════════════════════════════════════════════════"

  if [[ $FAILED -gt 0 ]]; then
    echo ""
    echo "  Failures:"
    echo -e "$ERRORS"
    echo ""
    exit 1
  fi

  echo ""
  echo "  All tests passed."
  echo ""
}

main "$@"
