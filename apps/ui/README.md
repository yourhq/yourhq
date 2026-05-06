# apps/ui

The Next.js dashboard for [yourhq.ai](https://yourhq.ai). Multi-project workspace UI for CRM, tasks, agents, knowledge, routines, and collections.

## Stack

- **Next.js 16** App Router, **React 19**
- **Tailwind v4** with `@theme inline` (no `tailwind.config.js`)
- **shadcn/ui** (New York, neutral base, CSS variables)
- **Radix UI** primitives
- **`cmdk`** for the command palette
- **`sonner`** for toasts
- **React Hook Form + Zod** for forms
- **TanStack React Table** for data tables
- **`@dnd-kit`** for drag and drop
- **Novel** (TipTap) for rich text
- **`next-themes`** for light/dark/system theming
- **Geist Sans + Geist Mono** via `next/font/google`
- **Supabase JS** for data, realtime, and auth

## Local development

```bash
cd apps/ui
npm install --legacy-peer-deps
npm run dev          # build templates index + start dev server on :3000
npm run build        # production build
npx tsc --noEmit     # type check
npm run lint         # eslint
```

A Supabase project is required. Either run the [interactive installer](../../installer/install.sh) or follow the self-host docs at [yourhq.ai/docs/self-host](https://yourhq.ai/docs/self-host).

## Source layout

```
apps/ui/src/
  app/
    dashboard/<module>/      Routes + server actions per feature module
    layout.tsx               Root: fonts, theme provider, toaster
    error.tsx                Root error boundary
    globals.css              All tokens — single source of truth for the visual system
  components/
    ui/                      60 primitives (shadcn/ui + 7 HQ extensions)
    shared/                  24 composites reused across modules
    <module>/                Feature components per module
    dashboard-shell.tsx      The sidebar + content shell mounted by dashboard/layout
    theme-provider.tsx       next-themes wrapper
    theme-toggle.tsx         Light/Dark/System dropdown
  hooks/
    use-<module>.ts          Per-module orchestrator hook (data, filters, CRUD, realtime)
    use-realtime-sync.ts     Multi-table Supabase realtime
    use-realtime.ts          Single-table Supabase realtime
  lib/
    <module>/types.ts        Schema-mirrored TypeScript types per module
    utils.ts                 cn() helper
    supabase/                Server and client Supabase factories
    audit/                   Audit log helpers
```

## Design system

Comprehensive design documentation lives in the public docs:

- [Design overview](https://yourhq.ai/design/overview) — principles
- [Foundations](https://yourhq.ai/design/foundations) — tokens, type, motion, theming
- [Primitives](https://yourhq.ai/design/components/primitives) — the 60 building blocks
- [Composites](https://yourhq.ai/design/components/composites) — the 24 shared compositions
- [Layout](https://yourhq.ai/design/patterns/layout), [Data display](https://yourhq.ai/design/patterns/data-display), [Creation and editing](https://yourhq.ai/design/patterns/creation-and-editing), [Interaction](https://yourhq.ai/design/patterns/interaction), [Feedback](https://yourhq.ai/design/patterns/feedback) — patterns
- [Contributing](https://yourhq.ai/design/contributing) — where new code goes, naming, decision trees

The source files for those docs live in [`docs-site/design/`](../../docs-site/design/) at the repo root.

## Conventions in one paragraph

Tokens not hexes. Aliases not relative cross-paths (`@/components`, `@/lib`, `@/hooks`). Kebab-case files, PascalCase components. `cn()` for conditional classes, CVA for variants, `data-slot` for sub-part targeting. Lists use `DataTable`. Creates use `SidePanel`. Confirms use `ConfirmDialog`. Forms use the `Form` primitives over RHF + Zod. Realtime via `use-realtime-sync`. No CSS modules, no styled-components, no Framer Motion.

For everything else, see the [contributing guide](https://yourhq.ai/design/contributing).
