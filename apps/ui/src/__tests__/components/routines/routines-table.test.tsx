import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoutinesTable } from "@/components/routines/routines-table";
import type { Routine } from "@/lib/routines/types";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/lib/routines/humanize", () => ({
  humanizeRoutine: (r: Routine) =>
    r.trigger_type === "schedule" ? "Daily at 9 AM" : "When a contact is created",
}));

function buildRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "rt-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_id: "agent-1",
    agent_slug: "sales-bot",
    name: "Daily Check-in",
    instruction: "Check inbox",
    trigger_type: "schedule",
    is_active: true,
    cadence_type: "daily",
    interval_n: null,
    days_of_week: [],
    day_of_month: null,
    time_of_day: "09:00",
    timezone: "America/New_York",
    next_run_at: new Date(Date.now() + 3600_000).toISOString(),
    last_run_at: new Date(Date.now() - 86400_000).toISOString(),
    run_count: 5,
    entity_type: null,
    collection_id: null,
    field: null,
    condition: null,
    value: null,
    meta: {},
    archived_at: null,
    agent: { id: "agent-1", name: "Sales Bot", slug: "sales-bot" },
    ...overrides,
  };
}

describe("RoutinesTable", () => {
  let onEdit: ReturnType<typeof vi.fn>;
  let onDelete: ReturnType<typeof vi.fn>;
  let onToggleActive: ReturnType<typeof vi.fn>;
  let onRunNow: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onEdit = vi.fn();
    onDelete = vi.fn();
    onToggleActive = vi.fn();
    onRunNow = vi.fn();
  });

  function renderTable(routines: Routine[] = []) {
    return render(
      <RoutinesTable
        routines={routines}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleActive={onToggleActive}
        onRunNow={onRunNow}
      />
    );
  }

  it("renders routine name", () => {
    renderTable([buildRoutine()]);
    expect(screen.getByText("Daily Check-in")).toBeInTheDocument();
  });

  it("renders humanized schedule description", () => {
    renderTable([buildRoutine()]);
    expect(screen.getByText("Daily at 9 AM")).toBeInTheDocument();
  });

  it("renders trigger type badge for schedule", () => {
    renderTable([buildRoutine({ trigger_type: "schedule" })]);
    expect(screen.getByText("Schedule")).toBeInTheDocument();
  });

  it("renders trigger type badge for event", () => {
    renderTable([buildRoutine({ trigger_type: "event", name: "On Contact Created" })]);
    expect(screen.getByText("Event")).toBeInTheDocument();
  });

  it("renders agent name", () => {
    renderTable([buildRoutine()]);
    expect(screen.getByText("Sales Bot")).toBeInTheDocument();
  });

  it("falls back to agent_slug when agent join is null", () => {
    renderTable([buildRoutine({ agent: null })]);
    expect(screen.getByText("sales-bot")).toBeInTheDocument();
  });

  it("renders active toggle switch", () => {
    renderTable([buildRoutine()]);
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(0);
  });

  it("renders run count", () => {
    renderTable([buildRoutine({ run_count: 42 })]);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("shows Never for routines that have never run", () => {
    renderTable([buildRoutine({ last_run_at: null })]);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("renders next run for active schedule routines", () => {
    renderTable([buildRoutine()]);
    expect(screen.getByText(/in about|in less|in \d/)).toBeInTheDocument();
  });

  it("calls onEdit when a row is clicked", async () => {
    const user = userEvent.setup();
    const routine = buildRoutine();
    renderTable([routine]);
    const row = screen.getByText("Daily Check-in").closest("tr");
    if (row) await user.click(row);
    expect(onEdit).toHaveBeenCalledWith(routine);
  });

  it("renders table headers", () => {
    renderTable([buildRoutine()]);
    expect(screen.getByText("Routine")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Next run")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
  });

  it("renders multiple routines", () => {
    const routines = [
      buildRoutine({ id: "rt-1", name: "Daily Check-in" }),
      buildRoutine({ id: "rt-2", name: "Weekly Report" }),
    ];
    renderTable(routines);
    expect(screen.getByText("Daily Check-in")).toBeInTheDocument();
    expect(screen.getByText("Weekly Report")).toBeInTheDocument();
  });

  it("shows dash for next run on event triggers", () => {
    renderTable([
      buildRoutine({
        trigger_type: "event",
        next_run_at: null,
      }),
    ]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
