import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactsFilterBar } from "@/components/crm/contacts-filter-bar";

vi.mock("@/hooks/use-pipeline-stages", () => ({
  usePipelineStages: () => ({
    stages: [
      { stage_key: "lead", label: "Lead" },
      { stage_key: "prospect", label: "Prospect" },
    ],
    stagesByKey: {
      lead: { stage_key: "lead", label: "Lead" },
      prospect: { stage_key: "prospect", label: "Prospect" },
    },
    defaultStage: null,
    loading: false,
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

describe("ContactsFilterBar", () => {
  let handlers: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    handlers = {
      onGlobalFilterChange: vi.fn(),
      onStatusFilterChange: vi.fn(),
      onPriorityFilterChange: vi.fn(),
      onFollowUpFilterChange: vi.fn(),
      onShowArchivedChange: vi.fn(),
      onViewModeChange: vi.fn(),
      onRefresh: vi.fn(),
      onAddContact: vi.fn(),
      onImport: vi.fn(),
      onClearFilters: vi.fn(),
    };
  });

  function renderBar(overrides: Record<string, unknown> = {}) {
    return render(
      <ContactsFilterBar
        contactCount={10}
        globalFilter=""
        onGlobalFilterChange={handlers.onGlobalFilterChange}
        statusFilter="all"
        onStatusFilterChange={handlers.onStatusFilterChange}
        priorityFilter="all"
        onPriorityFilterChange={handlers.onPriorityFilterChange}
        followUpFilter={false}
        onFollowUpFilterChange={handlers.onFollowUpFilterChange}
        showArchived={false}
        onShowArchivedChange={handlers.onShowArchivedChange}
        viewMode="table"
        onViewModeChange={handlers.onViewModeChange}
        onRefresh={handlers.onRefresh}
        onAddContact={handlers.onAddContact}
        onImport={handlers.onImport}
        onClearFilters={handlers.onClearFilters}
        {...overrides}
      />
    );
  }

  it("renders contact count", () => {
    renderBar();
    expect(screen.getByText(/10/)).toBeInTheDocument();
    expect(screen.getByText(/contacts/)).toBeInTheDocument();
  });

  it("renders the search input", () => {
    renderBar();
    expect(screen.getByPlaceholderText("Search contacts...")).toBeInTheDocument();
  });

  it("updates global filter on input", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.type(screen.getByPlaceholderText("Search contacts..."), "alice");
    expect(handlers.onGlobalFilterChange).toHaveBeenCalled();
  });

  it("renders New contact button", () => {
    renderBar();
    expect(screen.getByText("New contact")).toBeInTheDocument();
  });

  it("calls onAddContact when New contact is clicked", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("New contact"));
    expect(handlers.onAddContact).toHaveBeenCalledOnce();
  });

  it("renders Import button", () => {
    renderBar();
    expect(screen.getByText("Import")).toBeInTheDocument();
  });

  it("calls onImport when Import is clicked", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Import"));
    expect(handlers.onImport).toHaveBeenCalledOnce();
  });

  it("renders Due filter toggle", () => {
    renderBar();
    expect(screen.getByText("Due")).toBeInTheDocument();
  });

  it("calls onFollowUpFilterChange when Due is toggled", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Due"));
    expect(handlers.onFollowUpFilterChange).toHaveBeenCalledWith(true);
  });

  it("shows filtered/total count when different", () => {
    renderBar({ contactCount: 5, totalCount: 20 });
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
  });

  it("renders filter chips when filters are active", () => {
    renderBar({ statusFilter: "lead" });
    expect(screen.getByText("Status: Lead")).toBeInTheDocument();
  });

  it("shows Clear all when filters are active", () => {
    renderBar({ statusFilter: "lead" });
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("calls onClearFilters when Clear all is clicked", async () => {
    const user = userEvent.setup();
    renderBar({ statusFilter: "lead" });
    await user.click(screen.getByText("Clear all"));
    expect(handlers.onClearFilters).toHaveBeenCalledOnce();
  });

  it("shows search filter chip when globalFilter is set", () => {
    renderBar({ globalFilter: "test query" });
    expect(screen.getByText('Search: "test query"')).toBeInTheDocument();
  });

  it("shows archived chip when showArchived is true", () => {
    renderBar({ showArchived: true });
    expect(screen.getByText("Showing archived")).toBeInTheDocument();
  });
});
