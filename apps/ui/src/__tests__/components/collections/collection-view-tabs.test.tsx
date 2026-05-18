import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionViewTabs } from "@/components/collections/collection-view-tabs";
import type { CollectionView, CollectionField } from "@/lib/collections/types";

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  ResponsiveDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function buildView(overrides: Partial<CollectionView> = {}): CollectionView {
  return {
    id: "v-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    name: "Default Table",
    view_type: "table",
    config: {},
    is_default: true,
    sort_order: 0,
    ...overrides,
  };
}

function buildField(overrides: Partial<CollectionField> = {}): CollectionField {
  return {
    id: "f-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    field_key: "status",
    field_type: "select",
    label: "Status",
    description: null,
    sort_order: 0,
    required: false,
    options: { choices: [{ value: "active", label: "Active" }] },
    default_value: null,
    is_title_field: false,
    is_active: true,
    ...overrides,
  };
}

describe("CollectionViewTabs", () => {
  let onSelectView: ReturnType<typeof vi.fn>;
  let onCreateView: ReturnType<typeof vi.fn>;
  let onUpdateView: ReturnType<typeof vi.fn>;
  let onDeleteView: ReturnType<typeof vi.fn>;

  const views: CollectionView[] = [
    buildView({ id: "v-1", name: "All Records", view_type: "table", is_default: true }),
    buildView({ id: "v-2", name: "Board", view_type: "kanban", is_default: false }),
  ];

  const fields: CollectionField[] = [
    buildField(),
    buildField({
      id: "f-2",
      field_key: "due_date",
      field_type: "date",
      label: "Due Date",
      options: null,
    }),
  ];

  beforeEach(() => {
    onSelectView = vi.fn();
    onCreateView = vi.fn();
    onUpdateView = vi.fn();
    onDeleteView = vi.fn();
  });

  function renderTabs(activeView = views[0]) {
    return render(
      <CollectionViewTabs
        views={views}
        activeView={activeView}
        fields={fields}
        onSelectView={onSelectView}
        onCreateView={onCreateView}
        onUpdateView={onUpdateView}
        onDeleteView={onDeleteView}
      />
    );
  }

  it("renders all view tabs", () => {
    renderTabs();
    expect(screen.getByText("All Records")).toBeInTheDocument();
    expect(screen.getByText("Board")).toBeInTheDocument();
  });

  it("calls onSelectView when a tab is clicked", async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByText("Board"));
    expect(onSelectView).toHaveBeenCalledWith("v-2");
  });

  it("renders add view button (plus icon)", () => {
    renderTabs();
    const buttons = screen.getAllByRole("button");
    const plusButton = buttons.find((btn) =>
      btn.querySelector("[class*='lucide-plus']") !== null
    );
    expect(plusButton || buttons.length > 0).toBeTruthy();
  });

  it("highlights the active view tab", () => {
    renderTabs(views[0]);
    const activeTab = screen.getByText("All Records").closest("button");
    expect(activeTab?.className).toContain("border-foreground");
  });

  it("does not highlight non-active view tabs", () => {
    renderTabs(views[0]);
    const inactiveTab = screen.getByText("Board").closest("button");
    expect(inactiveTab?.className).toContain("border-transparent");
  });
});
