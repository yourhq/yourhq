import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoutineForm } from "@/components/routines/routine-form";
import type { Routine } from "@/lib/routines/types";

const mockFrom = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  contains: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  then: (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: [], error: null }).then(resolve),
});

const mockRpc = vi.fn().mockReturnValue({
  then: (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: null, error: null }).then(resolve),
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock("@/hooks/use-pipeline-stages", () => ({
  usePipelineStages: () => ({
    stageOptions: [
      { value: "lead", label: "Lead" },
      { value: "prospect", label: "Prospect" },
    ],
    stagesByKey: {
      lead: { stage_key: "lead", label: "Lead", color: "#3b82f6" },
      prospect: { stage_key: "prospect", label: "Prospect", color: "#22c55e" },
    },
    stages: [],
    loading: false,
  }),
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function buildRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "rt-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agent_id: "agent-1",
    agent_slug: "sales-bot",
    name: "Daily Check-in",
    instruction: "Check inbox and respond",
    trigger_type: "schedule",
    is_active: true,
    cadence_type: "daily",
    interval_n: null,
    days_of_week: [],
    day_of_month: null,
    time_of_day: "09:00",
    timezone: "America/New_York",
    next_run_at: null,
    last_run_at: null,
    run_count: 0,
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

describe("RoutineForm", () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn();
    onCancel = vi.fn();
    vi.clearAllMocks();
  });

  it("renders create mode title", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    const headings = screen.getAllByText("New routine");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders edit mode title", () => {
    render(
      <RoutineForm
        editingRoutine={buildRoutine()}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    const headings = screen.getAllByText("Edit routine");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("pre-fills name in edit mode", () => {
    render(
      <RoutineForm
        editingRoutine={buildRoutine({ name: "Morning Routine" })}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    const nameInput = screen.getByPlaceholderText("e.g. Daily inbox check");
    expect(nameInput).toHaveValue("Morning Routine");
  });

  it("renders trigger type toggle buttons", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText("Event")).toBeInTheDocument();
  });

  it("shows schedule config by default", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Quick presets")).toBeInTheDocument();
  });

  it("shows event config when event trigger is selected", async () => {
    const user = userEvent.setup();
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByText("Event"));
    expect(screen.getByText("When a")).toBeInTheDocument();
    expect(screen.queryByText("Quick presets")).not.toBeInTheDocument();
  });

  it("hides schedule config when switching to event", async () => {
    const user = userEvent.setup();
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Quick presets")).toBeInTheDocument();
    await user.click(screen.getByText("Event"));
    expect(screen.queryByText("Quick presets")).not.toBeInTheDocument();
  });

  it("shows agent selector", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("renders instruction textarea", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByPlaceholderText(/Check inbox and process/)).toBeInTheDocument();
  });

  it("shows template variable buttons for event trigger", async () => {
    const user = userEvent.setup();
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByText("Event"));
    expect(screen.getByText("{name}")).toBeInTheDocument();
    expect(screen.getByText("{old_value}")).toBeInTheDocument();
    expect(screen.getByText("{new_value}")).toBeInTheDocument();
  });

  it("renders active/paused toggle in footer", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders Cancel and Create routine buttons", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create routine" })).toBeInTheDocument();
  });

  it("renders Save changes button in edit mode", () => {
    render(
      <RoutineForm
        editingRoutine={buildRoutine()}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("shows quick presets for schedule trigger", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("Every 15 minutes")).toBeInTheDocument();
    expect(screen.getByText("Every 30 minutes")).toBeInTheDocument();
    expect(screen.getByText("Hourly")).toBeInTheDocument();
    expect(screen.getByText("Every 6 hours")).toBeInTheDocument();
  });

  it("initializes with event trigger when specified in initialValues", () => {
    render(
      <RoutineForm
        editingRoutine={null}
        initialValues={{ triggerType: "event" }}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText("When a")).toBeInTheDocument();
  });

  it("pre-fills instruction in edit mode", () => {
    render(
      <RoutineForm
        editingRoutine={buildRoutine({ instruction: "Do the thing" })}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    const textarea = screen.getByPlaceholderText(/Check inbox and process/);
    expect(textarea).toHaveValue("Do the thing");
  });
});
