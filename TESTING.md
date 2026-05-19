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
| **Total** | | **~203** | **~2,540** | |

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

## Manual integration testing

For Docker stack and E2E validation, see the staged test plan in [`docs-site/development/testing.mdx`](docs-site/development/testing.mdx) (Codespaces, Supabase, gateway, noVNC, etc.).
