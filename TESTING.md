# Testing Guide

## Quick start

```bash
make test              # UI + Python + Shell (fast local gate)
make test-ui           # Vitest only
make test-coverage     # With coverage reports + thresholds
make ci-fast           # Lint + tests (PR gate)
make ci-main           # Everything including DB contracts
```

Single file: `cd apps/ui && npx vitest run src/__tests__/hooks/use-tasks.test.ts`

Watch mode: `cd apps/ui && npx vitest src/__tests__/hooks/use-tasks.test.ts`

## Test inventory

| Runtime | Framework | Test files | Tests | Location |
|---------|-----------|------------|-------|----------|
| TypeScript (UI) | Vitest + jsdom + React Testing Library | 190 | ~2,270 | `apps/ui/src/__tests__/` |
| Python (Gateway) | pytest | 11 | 208 | `gateway/tests/` |
| Shell (Scripts) | bash runner | 1 | 11 | `gateway/scripts/tests/` |
| Database (Contracts) | psql assertions | 1 | ~50 | `db/tests/` |
| E2E (UI specs) | Playwright | 11 | 50 | `e2e/specs/` |
| E2E (ICP journeys) | Playwright | 3 | 21 | `e2e/journeys/` |
| **Total** | | **~217** | **~2,610** | |

## CI pipeline

**Every PR** (`ci.yml` — 8 parallel jobs):

- `ui-lint` — TypeScript type check + ESLint
- `ui-test` — Vitest (all 190 test files)
- `ui-build` — Next.js production build
- `worker` — Worker typecheck + build
- `python-lint` — ruff check + format
- `python-test` — pytest (208 tests)
- `shellcheck` — Shell script validation
- `shell-test` — Bash test runner

**Main branch only** (`ci-main.yml` — 2 additional jobs):

- `db-contracts` — RLS and schema contract tests against a live Postgres
- `coverage-report` — Combined UI + Python coverage with artifact upload

## Coverage thresholds

Configured in `apps/ui/vitest.config.ts` — CI fails if coverage drops below:

| Metric | Threshold |
|--------|-----------|
| Statements | 40% |
| Lines | 40% |
| Branches | 35% |
| Functions | 35% |

Coverage includes `src/lib/`, `src/hooks/`, `src/components/`, server actions, and API routes. Excludes shadcn primitives (`components/ui/`), page/layout files, and type-only files.

Run `make test-coverage` locally before pushing if you've added new source files.

## Test structure

```
apps/ui/src/__tests__/
  helpers/
    setup.ts              # Global mocks (next/headers, navigation, cache, DOM APIs)
    supabase-mock.ts      # createMockSupabaseClient — chainable per-table/RPC responses
    hook-harness.ts       # createHookHarness — shorthand for hook tests
    route-harness.ts      # callRoute — creates mock NextRequest, parses response
    server-only-stub.ts   # Empty module aliased for "server-only" imports
    server-mock.ts        # Server-side Supabase mocking utilities
    factories/            # buildAgent, buildTask, buildContact, buildKnowledgeItem, etc.
  hooks/                  # Hook tests (renderHook + mock Supabase)
  lib/                    # Pure logic tests (no DOM)
  components/             # Component tests (React Testing Library)
  actions/                # Server action tests
  api/                    # API route tests
  routes/                 # Route handler tests

gateway/tests/            # Python daemon tests (pytest)
gateway/scripts/tests/    # Shell script tests (bash)
db/tests/                 # Database contract tests (postgres assertions)
```

## Patterns

### Mock at the boundary, not internal logic

Mock Supabase, `next/navigation`, `next/headers`, external APIs. Never mock internal helpers or domain logic — test those directly.

### Factories

```ts
import { buildTask, buildAgent } from "../helpers/factories";

const task = buildTask({ status: "done", title: "Ship it" });
const agent = buildAgent({ name: "Builder" });
```

Factories auto-increment IDs. Pass overrides only for the fields you care about.

Available: `buildAgent`, `buildTask`, `buildContact`, `buildKnowledgeItem`, `buildCollectionDefinition`, `buildCollectionField`, `buildCollectionRecord`, `buildCollectionView`, `buildRoutine`, `buildSourceConnection`, `buildSyncRun`, `buildEntityLink`, `buildLabel`, `buildOrganization`.

### Hook tests

```ts
import { createMockSupabaseClient } from "../helpers/supabase-mock";

const item = buildKnowledgeItem();
const supabase = createMockSupabaseClient({
  tables: new Map([["knowledge_items", { select: { data: [item], error: null } }]]),
});

vi.mock("@/lib/supabase/client", () => ({ createClient: () => supabase }));

const { result } = renderHook(() => useKnowledge());
await waitFor(() => expect(result.current.items).toHaveLength(1));
```

### Component tests

Use `getAllBy*` when elements render in multiple viewports (sidebar + inline sidebar). Prefer `getByRole` and `getByText` over test IDs. Test user interactions with `userEvent.setup()`.

### API route tests

```ts
import { callRoute } from "../helpers/route-harness";

const { status, data } = await callRoute(GET, { searchParams: { q: "test" } });
expect(status).toBe(200);
```

### Rules

- Don't mock internal functions — test them directly
- Don't use `getByTestId` when `getByRole` or `getByText` works
- Don't add `data-testid` to production code unless necessary
- Don't test implementation details (state shape, effect timing)
- Don't duplicate coverage — if a hook is tested, component tests mock it

## Writing new tests

**Lib tests** (pure logic, no DOM): create a file in `__tests__/lib/<module>/` that imports the function directly. No mocks needed for pure functions.

**Hook tests**: mock `@/lib/supabase/client`, `@/hooks/use-realtime`, and `sonner` at the top of the file. Use `createMockSupabaseClient` to configure per-table responses. Use `renderHook` + `waitFor` + `act` from `@testing-library/react`. See existing hook tests for the full pattern.

**Component tests**: mock the hooks the component uses (not the Supabase layer). Render with `render()`, assert with screen queries. For components that use `next-themes`, mock `useTheme`. For components using `next/image`, mock the default export.

**Python tests**: add to `gateway/tests/`. Use pytest fixtures in `conftest.py`. Mark tests that need external services with `@pytest.mark.integration`.

**DB contract tests**: add assertions to `db/tests/run-db-tests.sh`. These run against a real Postgres in CI.

## E2E tests (Playwright)

End-to-end tests exercise the full stack through a real browser against a running HQ instance.

```bash
# UI-only specs ($0 cost, no LLM calls)
cd e2e && npm test

# ICP journey specs (real LLM execution, $2 Claude budget cap)
cd e2e && npm run test:live

# All specs
cd e2e && npm run test:all

# Seed demo data for recording walkthroughs
cd e2e && npm run seed:demo
```

### Structure

```
e2e/
  fixtures/
    auth.fixture.ts       # Authenticated page session (cookies from setup)
    supabase.ts           # Direct DB queries via service role
    agent-execution.ts    # Polling helpers for inbox, usage, budgets
    test-data.ts          # Constants for UI spec assertions
  specs/
    00-onboarding.spec.ts # Setup project: onboarding wizard
    01-agents.spec.ts     # Agent CRUD
    03-tasks.spec.ts      # Task lifecycle
    ...                   # Other dashboard modules
    10-channels.spec.ts   # Telegram channel pairing
  journeys/
    solopreneur.spec.ts   # ICP: solo founder, task→agent→done (@live)
    agency-builder.spec.ts # ICP: multi-agent org hierarchy (@live)
    tinkerer.spec.ts      # ICP: knowledge + routines + audit (@live)
  scripts/
    seed-demo.ts          # Populate workspace with demo data
  BUGS.md               # Platform bugs found during E2E testing
```

### Tags

- `@smoke` — critical-path subset, runs on every deploy
- `@live` — requires real LLM API keys, excluded by default (run via `test:live`)

### Environment

Required in `e2e/.env` (gitignored):

```
E2E_SUPABASE_URL=...
E2E_SUPABASE_SERVICE_ROLE_KEY=...
E2E_BASE_URL=http://localhost:3000
E2E_TELEGRAM_BOT_TOKEN=...        # Optional, for channel tests
E2E_TELEGRAM_PAIRING_CODE=...     # Optional, set after /start
```

The LLM API keys (Anthropic, OpenAI) are configured in the running HQ instance, not in the E2E env file.

### Budget enforcement

Journey specs enforce cumulative spend < $2 per agent per run. If usage reporting is delayed or not configured, those assertions gracefully skip rather than fail.

## Manual integration testing

For Docker stack and E2E validation, see the staged test plan in [`docs-site/development/testing.mdx`](docs-site/development/testing.mdx) (Codespaces, Supabase, gateway, noVNC, etc.).
