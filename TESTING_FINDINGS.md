# Testing Findings

Bugs, edge cases, and UX improvements discovered while building the test suite.

## Bugs Fixed (on main, commit 5ad3e03)

| # | Area | Finding | Fix |
|---|------|---------|-----|
| 1 | file_processor.py | `cfg.supabase_url` doesn't exist on `ResolvedConfig` | Changed to `cfg.url` |
| 2 | source_sync.py | Same `cfg.supabase_url` bug | Changed to `cfg.url` |
| 3 | onboarding/progress.ts | `loadProgress()` returns default by reference — caller mutation poisons future loads | Added `freshDefaults()` that returns new object each call |
| 4 | api/embed/route.ts | Malformed JSON throws unhandled error, returns 502 instead of 400 | Added defensive `req.json().catch(() => null)` |
| 5 | api/validate-provider/route.ts | Same malformed JSON bug | Same fix |
| 6 | remove-agent.sh | `--help` treated as agent name | Added usage function and case statement |

## Test Observations

| # | Area | Observation |
|---|------|-------------|
| 1 | import/mapping.ts | Custom fields with same key as core fields overwrite the core alias (last-write-wins). Intentional but worth documenting. |
| 2 | knowledge/import-utils.ts | `filenameToTitle("report.pdf")` returns "Report.Pdf" — word boundary regex treats `.` as boundary. Edge case, not a bug. |
| 3 | Component tests | Several components render duplicate text in headers + empty states (e.g., "Add gateway" button in both PageHeader and EmptyState). Tests need `getAllBy*` queries. |
| 4 | File upload | `userEvent.upload` doesn't reliably trigger custom drop zone handlers in jsdom. File upload tests work for native inputs but not custom zones. |

## Coverage Summary

| Runtime | Framework | Test Files | Tests | Time |
|---------|-----------|------------|-------|------|
| TypeScript (UI) | Vitest + jsdom | 125 | 1,677 | ~60s |
| Python (Gateway) | pytest | 11 | 208 | <1s |
| Shell (Scripts) | bash runner | 1 | 11 | <1s |
| DB (Contracts) | psql | 1 | ~50 | CI only |
| **Total** | | **138** | **~1,946** | |
