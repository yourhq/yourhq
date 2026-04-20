# UI Patterns & Design System

## Philosophy

Linear-inspired: minimalist, information-dense, keyboard-first. Dark-only theme. Monochrome with purposeful color (status indicators, priority dots, stream colors). Forms use progressive disclosure — hero title, inline property tokens, sections collapse by default.

---

## Theme

Defined in `src/app/globals.css` using OKLch tokens:

```css
--background: oklch(0.115 0 0);   /* Near-black */
--card:       oklch(0.135 0 0);   /* Slightly lighter */
--border:     oklch(1 0 0 / 6%);  /* Very subtle */
--radius:     0.375rem;           /* Tight corners */
```

Custom text tokens: `--text-secondary`, `--text-tertiary`. Thin custom scrollbar globally.

Fonts: **Geist Sans** (body) + **Geist Mono** (code/data).

---

## Core UI primitives

### `StatusDot` — [src/components/ui/status-dot.tsx](../src/components/ui/status-dot.tsx)

Small colored circle + optional label. Replaces Badge overuse.

```tsx
<StatusDot color="#22c55e" label="Active" />
<StatusDot color="#ef4444" pulse />
```

Props: `color`, `label?`, `pulse?`, `size?: "sm" | "md"`.

### `TagInput` — [src/components/ui/tag-input.tsx](../src/components/ui/tag-input.tsx)

Multi-value pill input. Enter or comma to add, X or Backspace to remove.

### `DatePickerButton` — [src/components/ui/date-picker-button.tsx](../src/components/ui/date-picker-button.tsx)

Button that opens a Calendar popover. Pass `portal={false}` inside a Dialog.

### `InlineEdit` — [src/components/ui/inline-edit.tsx](../src/components/ui/inline-edit.tsx)

Click-to-edit text field for detail views. Blur or Escape to save.

### `DynamicField` — [src/components/shared/dynamic-field.tsx](../src/components/shared/dynamic-field.tsx)

Polymorphic input driven by a `FieldDefinition` row. Renders the right UI for `text`, `textarea`, `number`, `boolean`, `url`, `select`, `multiselect`, or `date`.

---

## Layout components

### `DashboardShell` — [src/components/dashboard-shell.tsx](../src/components/dashboard-shell.tsx)

Root layout wrapper with a 220px collapsible sidebar (custom — not shadcn SidebarProvider). Keyboard shortcuts provider.

### `SidePanel` — [src/components/shared/side-panel.tsx](../src/components/shared/side-panel.tsx)

Right-slide Sheet for forms. Used by contact / organization editing. Pass `title=""` to hide the header (useful for Linear-style forms with their own hero title).

### `PageHeader` / `PageLayout` — [src/components/shared/](../src/components/shared/)

Page title, icon, actions, optional tabs.

### `HeaderBar` — [src/components/shared/header-bar.tsx](../src/components/shared/header-bar.tsx)

40px breadcrumb header derived from the URL pathname.

### `FilterBar` — [src/components/shared/filter-bar.tsx](../src/components/shared/filter-bar.tsx)

Horizontal filter layout: search + dropdowns + count.

### `DataTable` — [src/components/shared/data-table.tsx](../src/components/shared/data-table.tsx)

TanStack React Table wrapper with sticky headers, row click, loading and empty states.

### `FolderTree` — [src/components/shared/folder-tree.tsx](../src/components/shared/folder-tree.tsx)

Hierarchical folder browser. Used by documents and assets. Supports dnd-kit drag-and-drop.

### `EmptyState` / `LoadingSkeleton` — [src/components/shared/](../src/components/shared/)

Empty state with icon/title/description + optional action. Skeletons have `table`, `cards`, `list`, `feed`, `detail` variants.

### `CommandCenter` — [src/components/shared/command-center.tsx](../src/components/shared/command-center.tsx)

`⌘K` global navigation palette.

---

## Linear-style form pattern

All create/edit forms follow this shape:

```
┌─────────────────────────────────┐
│  Title (auto-resizing textarea) │  ← Hero, largest text
│  "Add description..." (hidden)  │
├─────────────────────────────────┤
│  ○ Status  · High  · Stream     │  ← Inline h-6 property tokens
├─────────────────────────────────┤
│  ▸ Dynamic field group 1        │  ← Progressive disclosure
│  ▸ Dynamic field group 2        │
├─────────────────────────────────┤
│  Press Enter to save  · Cancel  │
└─────────────────────────────────┘
```

**Title**: unstyled `<textarea>` with `resize-none`, `border-0`, `bg-transparent`, auto-height via `useEffect`.

**Property tokens**: `<Select>` trigger styled `h-6 w-auto gap-1 border-border/50 bg-transparent px-2 text-xs font-normal hover:bg-accent`. Status / priority use colored dots in the trigger.

**Progressive disclosure**: descriptions and custom-field groups default collapsed for new items, auto-expand when editing items that already have data.

**Submit**: Enter key on title submits; Cancel and Submit buttons in the bottom bar.

### Portal fix for Radix inside Dialog

**Critical:** when using `Select` / `Popover` / `DatePickerButton` inside a `Dialog`, pass `portal={false}` on the `SelectContent` / `PopoverContent`. Otherwise, Radix portals the dropdown outside the Dialog container and the modal overlay blocks pointer events.

```tsx
<Select value={status} onValueChange={setStatus}>
  <SelectTrigger>…</SelectTrigger>
  <SelectContent portal={false}>  {/* required inside Dialog */}
    <SelectItem value="todo">To Do</SelectItem>
  </SelectContent>
</Select>
```

SidePanel-based forms don't need this — Sheet doesn't block portals.

---

## Color conventions

### Pipeline stages (CRM)

Stage colors come from the `pipeline_stages.color` column at runtime, not a hard-coded palette. The setup wizard seeds sensible defaults; Settings → Pipeline lets the user change them. StatusDot reads the color from the current stage record.

### Task priority

| Priority | Color |
|---|---|
| urgent | red |
| high | orange |
| medium | yellow |
| low | blue |

### Task status icons (Unicode)

| Status | Icon |
|---|---|
| todo | ○ |
| in_progress | ◐ |
| blocked | ◍ |
| done | ● |
| cancelled | ⊘ |
| missed | ◌ |

### Agent status

| Status | Color | Feature |
|---|---|---|
| online | green | Pulse animation |
| offline | gray | — |
| error | red | — |
| paused | yellow | — |

### Audit log module badges

| Module | Color |
|---|---|
| crm | blue |
| tasks | purple |
| assets | amber |
| agents | emerald |
| documents | sky |
| automations | rose |
| settings | slate |

---

## View modes

Modules with multiple view modes persist the choice in `localStorage`:

| Module | Modes | Storage key |
|---|---|---|
| CRM contacts | Table / Cards / Kanban | `crm-view-mode` |
| Tasks | List / Board / Recurring | `tasks-view-mode` |
| Documents | List / Grid | `documents-view-mode` |
| Assets | Grid / List | `assets-view-mode` |

Folder trees also persist expanded state (e.g. `documents.expandedFolders`).

---

## Drag-and-drop

Library: **dnd-kit** with `PointerSensor` and a 5px activation constraint (so clicks still fire).

Used for:
- Tasks kanban column moves
- Contacts kanban stage moves
- Folder / document / asset moves in their tree sidebars

Each module scopes its own `DndContext`; sensors and sortable IDs don't cross module boundaries.

---

## Keyboard-first design

| Key | Action |
|---|---|
| `⌘K` | Command palette |
| `⌘B` | Toggle sidebar |
| `?` | Keyboard help |
| `G D/C/T/A/L/G` | Navigate Dashboard / CRM / Tasks / Assets / Activity / Agents |
| `Enter` (in form title) | Submit |
| `Enter` or `,` (in TagInput) | Add tag |
| `Escape` | Close dialog / panel |

---

## URL state

Filter and view state syncs to search params for shareable links:

- CRM — `?tab=…&status=<stage_key>&q=<search>&sort=<field>&dir=<asc|desc>`
- Tasks — `?task=<id>&series=<id>` for deep links to specific items
- Documents — folder, search, boot filter
- Activity — module, action, actor filters

View mode and folder-tree expansion persist to `localStorage` rather than URL since they're per-user preferences.
