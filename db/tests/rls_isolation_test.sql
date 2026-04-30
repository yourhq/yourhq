-- rls_isolation_test.sql — Verify cross-tenant RLS isolation.
--
-- Run this in the Supabase SQL Editor or via psql after all migrations
-- (001 through 021) have been applied.
--
-- What it does:
--   1. Creates two test tenants with known UUIDs.
--   2. Creates two auth.users (one per tenant) with app_metadata.tenant_id.
--   3. Inserts test data for tenant_a into workspace, gateways, agents,
--      contacts, and tasks.
--   4. Switches to tenant_b's JWT context and asserts 0 rows visible.
--   5. Switches to tenant_a's JWT context and asserts all rows visible.
--   6. Tests that the tenants table itself is isolated (tenant_a sees only
--      its own row, not tenant_b's).
--   7. Cleans up all test data.
--
-- The test uses ASSERT inside a DO block — a failing assertion raises an
-- exception and rolls back the transaction, making it safe to run against
-- a live database.

BEGIN;

-- ════════════════════════════════════════════════════════════════════
-- Step 1: Create two test tenants
-- ════════════════════════════════════════════════════════════════════

-- Fixed UUIDs so we can reference them throughout the test.
-- Chosen to be clearly distinct from the default tenant (all-zeros).
DO $$
DECLARE
  v_tenant_a_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_tenant_b_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
BEGIN
  INSERT INTO tenants (id, name, slug) VALUES
    (v_tenant_a_id, 'Test Tenant A', 'test-tenant-a'),
    (v_tenant_b_id, 'Test Tenant B', 'test-tenant-b')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '[setup] Created test tenants A=% and B=%', v_tenant_a_id, v_tenant_b_id;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 2: Create two auth users (one per tenant)
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_user_a_id uuid := '11111111-1111-1111-1111-111111111111';
  v_user_b_id uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- Insert user A (belongs to tenant A)
  INSERT INTO auth.users (
    id, instance_id, role, aud, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    v_user_a_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'rls-test-a@test.local',
    crypt('testpassword', gen_salt('bf')),
    now(),
    '{"provider": "email", "tenant_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}'::jsonb,
    '{}'::jsonb,
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert user B (belongs to tenant B)
  INSERT INTO auth.users (
    id, instance_id, role, aud, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    v_user_b_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'rls-test-b@test.local',
    crypt('testpassword', gen_salt('bf')),
    now(),
    '{"provider": "email", "tenant_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}'::jsonb,
    '{}'::jsonb,
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '[setup] Created test auth users A=% and B=%', v_user_a_id, v_user_b_id;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 3: Insert test data for tenant_a into key tables
-- ════════════════════════════════════════════════════════════════════

-- We insert as service_role (the default psql / SQL Editor role), which
-- bypasses RLS. This lets us seed data with explicit tenant_id values.

DO $$
DECLARE
  v_tid        uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_ws_id      uuid := 'a0a0a0a0-0001-0001-0001-000000000001';
  v_gw_id      uuid := 'a0a0a0a0-0002-0002-0002-000000000002';
  v_agent_id   uuid := 'a0a0a0a0-0003-0003-0003-000000000003';
  v_contact_id uuid := 'a0a0a0a0-0004-0004-0004-000000000004';
  v_task_id    uuid := 'a0a0a0a0-0005-0005-0005-000000000005';
BEGIN
  -- workspace
  INSERT INTO workspace (id, name, slug, tenant_id)
  VALUES (v_ws_id, 'Tenant A Workspace', 'tenant-a-ws', v_tid)
  ON CONFLICT (id) DO NOTHING;

  -- gateways
  INSERT INTO gateways (id, slug, label, status, tenant_id)
  VALUES (v_gw_id, 'test-gw-a', 'Test Gateway A', 'ready', v_tid)
  ON CONFLICT (id) DO NOTHING;

  -- agents (references gateway)
  INSERT INTO agents (id, name, slug, status, gateway_id, tenant_id)
  VALUES (v_agent_id, 'Test Agent A', 'test-agent-a', 'ready', v_gw_id, v_tid)
  ON CONFLICT (id) DO NOTHING;

  -- contacts
  INSERT INTO contacts (id, name, email, tenant_id)
  VALUES (v_contact_id, 'Alice Tenant-A', 'alice@tenant-a.test', v_tid)
  ON CONFLICT (id) DO NOTHING;

  -- tasks
  INSERT INTO tasks (id, title, status, tenant_id)
  VALUES (v_task_id, 'Tenant A Task', 'todo', v_tid)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE '[setup] Inserted test data for tenant A into workspace, gateways, agents, contacts, tasks';
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 4: Switch to tenant_b — verify ZERO rows visible (isolation)
-- ════════════════════════════════════════════════════════════════════

-- Simulate a PostgREST JWT for tenant B by setting the session claims.
-- current_tenant_id() reads from request.jwt.claims -> app_metadata -> tenant_id.

DO $$
DECLARE
  v_count int;
  v_jwt_b text := '{"role":"authenticated","app_metadata":{"tenant_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}}';
BEGIN
  -- Set the JWT claims and switch to the authenticated role
  PERFORM set_config('request.jwt.claims', v_jwt_b, true);
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '[test] Switched to tenant_b context. Running cross-tenant isolation checks...';

  -- workspace: tenant_b should see 0 rows of tenant_a data
  SELECT count(*) INTO v_count FROM workspace
  WHERE id = 'a0a0a0a0-0001-0001-0001-000000000001';
  ASSERT v_count = 0,
    format('FAIL: tenant_b sees %s workspace row(s) from tenant_a — expected 0', v_count);
  RAISE NOTICE '[pass] workspace: tenant_b sees 0 rows from tenant_a';

  -- gateways
  SELECT count(*) INTO v_count FROM gateways
  WHERE id = 'a0a0a0a0-0002-0002-0002-000000000002';
  ASSERT v_count = 0,
    format('FAIL: tenant_b sees %s gateway row(s) from tenant_a — expected 0', v_count);
  RAISE NOTICE '[pass] gateways: tenant_b sees 0 rows from tenant_a';

  -- agents
  SELECT count(*) INTO v_count FROM agents
  WHERE id = 'a0a0a0a0-0003-0003-0003-000000000003';
  ASSERT v_count = 0,
    format('FAIL: tenant_b sees %s agent row(s) from tenant_a — expected 0', v_count);
  RAISE NOTICE '[pass] agents: tenant_b sees 0 rows from tenant_a';

  -- contacts
  SELECT count(*) INTO v_count FROM contacts
  WHERE id = 'a0a0a0a0-0004-0004-0004-000000000004';
  ASSERT v_count = 0,
    format('FAIL: tenant_b sees %s contact row(s) from tenant_a — expected 0', v_count);
  RAISE NOTICE '[pass] contacts: tenant_b sees 0 rows from tenant_a';

  -- tasks
  SELECT count(*) INTO v_count FROM tasks
  WHERE id = 'a0a0a0a0-0005-0005-0005-000000000005';
  ASSERT v_count = 0,
    format('FAIL: tenant_b sees %s task row(s) from tenant_a — expected 0', v_count);
  RAISE NOTICE '[pass] tasks: tenant_b sees 0 rows from tenant_a';

  -- tenants table itself: tenant_b should see its own row but NOT tenant_a's
  SELECT count(*) INTO v_count FROM tenants
  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  ASSERT v_count = 0,
    format('FAIL: tenant_b sees tenant_a row in tenants table — expected 0, got %s', v_count);
  RAISE NOTICE '[pass] tenants: tenant_b cannot see tenant_a row';

  SELECT count(*) INTO v_count FROM tenants
  WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  ASSERT v_count = 1,
    format('FAIL: tenant_b cannot see its own tenants row — expected 1, got %s', v_count);
  RAISE NOTICE '[pass] tenants: tenant_b CAN see its own row';

  RAISE NOTICE '[test] All cross-tenant isolation checks passed for tenant_b';

  -- Reset role before leaving
  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 5: Switch to tenant_a — verify data IS visible (positive test)
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_count int;
  v_jwt_a text := '{"role":"authenticated","app_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}';
BEGIN
  PERFORM set_config('request.jwt.claims', v_jwt_a, true);
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '[test] Switched to tenant_a context. Running visibility checks...';

  -- workspace
  SELECT count(*) INTO v_count FROM workspace
  WHERE id = 'a0a0a0a0-0001-0001-0001-000000000001';
  ASSERT v_count = 1,
    format('FAIL: tenant_a cannot see its own workspace — expected 1, got %s', v_count);
  RAISE NOTICE '[pass] workspace: tenant_a sees its own row';

  -- gateways
  SELECT count(*) INTO v_count FROM gateways
  WHERE id = 'a0a0a0a0-0002-0002-0002-000000000002';
  ASSERT v_count = 1,
    format('FAIL: tenant_a cannot see its own gateway — expected 1, got %s', v_count);
  RAISE NOTICE '[pass] gateways: tenant_a sees its own row';

  -- agents
  SELECT count(*) INTO v_count FROM agents
  WHERE id = 'a0a0a0a0-0003-0003-0003-000000000003';
  ASSERT v_count = 1,
    format('FAIL: tenant_a cannot see its own agent — expected 1, got %s', v_count);
  RAISE NOTICE '[pass] agents: tenant_a sees its own row';

  -- contacts
  SELECT count(*) INTO v_count FROM contacts
  WHERE id = 'a0a0a0a0-0004-0004-0004-000000000004';
  ASSERT v_count = 1,
    format('FAIL: tenant_a cannot see its own contact — expected 1, got %s', v_count);
  RAISE NOTICE '[pass] contacts: tenant_a sees its own row';

  -- tasks
  SELECT count(*) INTO v_count FROM tasks
  WHERE id = 'a0a0a0a0-0005-0005-0005-000000000005';
  ASSERT v_count = 1,
    format('FAIL: tenant_a cannot see its own task — expected 1, got %s', v_count);
  RAISE NOTICE '[pass] tasks: tenant_a sees its own row';

  -- tenants table: tenant_a should see its own row but NOT tenant_b's
  SELECT count(*) INTO v_count FROM tenants
  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  ASSERT v_count = 1,
    format('FAIL: tenant_a cannot see its own tenants row — expected 1, got %s', v_count);
  RAISE NOTICE '[pass] tenants: tenant_a sees its own row';

  SELECT count(*) INTO v_count FROM tenants
  WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  ASSERT v_count = 0,
    format('FAIL: tenant_a can see tenant_b row in tenants — expected 0, got %s', v_count);
  RAISE NOTICE '[pass] tenants: tenant_a cannot see tenant_b row';

  RAISE NOTICE '[test] All visibility checks passed for tenant_a';

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 6: Test INSERT isolation — tenant_b cannot insert into tenant_a
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_jwt_b text := '{"role":"authenticated","app_metadata":{"tenant_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}}';
  v_inserted bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims', v_jwt_b, true);
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '[test] Testing INSERT isolation: tenant_b trying to write data with tenant_a''s tenant_id...';

  -- Attempt to insert a contact with tenant_a's tenant_id while authenticated as tenant_b.
  -- The WITH CHECK clause should block this.
  BEGIN
    INSERT INTO contacts (id, name, email, tenant_id)
    VALUES (
      'deadbeef-dead-beef-dead-beefdeadbeef',
      'Intruder',
      'intruder@evil.test',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    );
    v_inserted := true;
  EXCEPTION WHEN others THEN
    v_inserted := false;
  END;

  ASSERT NOT v_inserted,
    'FAIL: tenant_b was able to INSERT a row with tenant_a''s tenant_id — WITH CHECK violation expected';
  RAISE NOTICE '[pass] INSERT isolation: tenant_b cannot insert data under tenant_a''s tenant_id';

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 7: Test UPDATE isolation — tenant_b cannot update tenant_a's rows
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_jwt_b text := '{"role":"authenticated","app_metadata":{"tenant_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}}';
  v_count int;
BEGIN
  PERFORM set_config('request.jwt.claims', v_jwt_b, true);
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '[test] Testing UPDATE isolation: tenant_b trying to update tenant_a''s contact...';

  UPDATE contacts SET name = 'HACKED' WHERE id = 'a0a0a0a0-0004-0004-0004-000000000004';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  ASSERT v_count = 0,
    format('FAIL: tenant_b updated %s row(s) belonging to tenant_a — expected 0', v_count);
  RAISE NOTICE '[pass] UPDATE isolation: tenant_b cannot update tenant_a''s rows (0 affected)';

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 8: Test DELETE isolation — tenant_b cannot delete tenant_a's rows
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_jwt_b text := '{"role":"authenticated","app_metadata":{"tenant_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}}';
  v_count int;
BEGIN
  PERFORM set_config('request.jwt.claims', v_jwt_b, true);
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '[test] Testing DELETE isolation: tenant_b trying to delete tenant_a''s task...';

  DELETE FROM tasks WHERE id = 'a0a0a0a0-0005-0005-0005-000000000005';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  ASSERT v_count = 0,
    format('FAIL: tenant_b deleted %s row(s) belonging to tenant_a — expected 0', v_count);
  RAISE NOTICE '[pass] DELETE isolation: tenant_b cannot delete tenant_a''s rows (0 affected)';

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 9: Verify tenant_a's data survived all attacks
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_jwt_a text := '{"role":"authenticated","app_metadata":{"tenant_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}}';
  v_count int;
  v_name  text;
BEGIN
  PERFORM set_config('request.jwt.claims', v_jwt_a, true);
  SET LOCAL ROLE authenticated;

  RAISE NOTICE '[test] Final integrity check: verifying tenant_a data is intact after tenant_b attacks...';

  SELECT count(*) INTO v_count FROM contacts
  WHERE id = 'a0a0a0a0-0004-0004-0004-000000000004';
  ASSERT v_count = 1, 'FAIL: tenant_a contact was deleted or lost';

  SELECT name INTO v_name FROM contacts
  WHERE id = 'a0a0a0a0-0004-0004-0004-000000000004';
  ASSERT v_name = 'Alice Tenant-A',
    format('FAIL: tenant_a contact name was tampered — expected "Alice Tenant-A", got "%s"', v_name);

  SELECT count(*) INTO v_count FROM tasks
  WHERE id = 'a0a0a0a0-0005-0005-0005-000000000005';
  ASSERT v_count = 1, 'FAIL: tenant_a task was deleted or lost';

  RAISE NOTICE '[pass] All tenant_a data intact — no cross-tenant mutation occurred';

  RESET ROLE;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- Step 10: Cleanup — remove all test data
-- ════════════════════════════════════════════════════════════════════

-- Run cleanup as the superuser/service_role (which bypasses RLS).
-- Delete in FK-safe order.

DO $$
BEGIN
  RAISE NOTICE '[cleanup] Removing test data...';

  DELETE FROM tasks    WHERE id = 'a0a0a0a0-0005-0005-0005-000000000005';
  DELETE FROM contacts WHERE id = 'a0a0a0a0-0004-0004-0004-000000000004';
  DELETE FROM agents   WHERE id = 'a0a0a0a0-0003-0003-0003-000000000003';
  DELETE FROM gateways WHERE id = 'a0a0a0a0-0002-0002-0002-000000000002';
  DELETE FROM workspace WHERE id = 'a0a0a0a0-0001-0001-0001-000000000001';

  -- Clean up the intruder row if it somehow got inserted
  DELETE FROM contacts WHERE id = 'deadbeef-dead-beef-dead-beefdeadbeef';

  DELETE FROM auth.users WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  );

  DELETE FROM tenants WHERE id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  );

  RAISE NOTICE '[cleanup] Done. All test artifacts removed.';
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- Summary
-- ════════════════════════════════════════════════════════════════════
--
-- If you reach this point without an assertion error, all tests passed:
--
--   [pass] Cross-tenant SELECT isolation on workspace, gateways, agents,
--          contacts, tasks, and tenants.
--   [pass] Same-tenant SELECT visibility on all tables.
--   [pass] Cross-tenant INSERT blocked by WITH CHECK.
--   [pass] Cross-tenant UPDATE returns 0 affected rows.
--   [pass] Cross-tenant DELETE returns 0 affected rows.
--   [pass] Data integrity preserved after all attack attempts.
--
-- Any failure raises an exception with a descriptive message and rolls
-- back the entire transaction, leaving the database unchanged.
