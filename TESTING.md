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

## Test structure

```
apps/ui/src/__tests__/
  helpers/
    setup.ts              # Global mocks (next/headers, navigation, cache, DOM APIs)
    supabase-mock.ts      # createMockSupabaseClient — chainable per-table/RPC responses
    hook-harness.ts       # createHookHarness — shorthand for hook tests
    route-harness.ts      # callRoute — creates mock NextRequest, parses response
    server-only-stub.ts   # Empty module aliased for "server-only" imports
    factories/            # buildAgent, buildTask, buildContact, buildKnowledgeItem, etc.
  hooks/                  # Hook tests (renderHook + mock Supabase)
  lib/                    # Pure logic tests (no DOM)
  components/             # Component tests (React Testing Library)

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

## Coverage

Thresholds enforced in `vitest.config.ts` — CI fails if coverage drops below the configured minimums. Run `make test-coverage` to check locally.

## Manual integration testing

For Docker stack and E2E validation, see the staged test plan in [the original manual testing doc](docs-site/testing.mdx) (Codespaces, Supabase, gateway, noVNC, etc.).
