import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildTask, resetTaskCounter } from "@/__tests__/helpers/factories/task";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import type { Task } from "@/lib/tasks/types";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/onboarding/progress", () => ({
  completeItem: vi.fn(),
}));

vi.mock("@/hooks/use-buffered-entity-links", () => ({
  useBufferedEntityLinks: () => ({
    links: [],
    loading: false,
    dirty: false,
    actions: {
      addLink: vi.fn(),
      removeLink: vi.fn(),
      searchTargets: vi.fn(),
      flush: vi.fn(),
    },
  }),
}));

vi.mock("@/hooks/use-labels", () => ({
  useLabels: () => ({
    labels: [],
    actions: {
      getTaskLabels: vi.fn().mockResolvedValue([]),
      addLabelToTask: vi.fn(),
      removeLabelFromTask: vi.fn(),
      createLabel: vi.fn(),
    },
  }),
}));

vi.mock("@/hooks/use-task-series", () => ({
  useTaskSeries: () => ({
    actions: {
      createSeries: vi.fn(),
      updateSeries: vi.fn(),
    },
  }),
}));

vi.mock("@/lib/workspace/timezone", () => ({
  browserTimezone: () => "America/New_York",
  getWorkspaceTimezone: vi.fn().mockResolvedValue("America/New_York"),
}));

vi.mock("@/components/tasks/task-timeline", () => ({
  TaskTimeline: () => <div data-testid="task-timeline" />,
}));

vi.mock("@/lib/tasks/cadence", () => ({
  shortCadenceLabel: () => "Daily",
}));

vi.mock("@/components/tasks/task-relations", () => ({
  TaskRelations: () => <div data-testid="task-relations" />,
}));

vi.mock("@/components/tasks/task-deliverables", () => ({
  TaskDeliverables: () => <div data-testid="task-deliverables" />,
}));

vi.mock("@/components/tasks/task-subtasks", () => ({
  TaskSubtasks: () => <div data-testid="task-subtasks" />,
}));

vi.mock("@/components/tasks/task-labels-picker", () => ({
  TaskLabelsPicker: () => <div data-testid="labels-picker" />,
  TaskLabelPills: () => <div data-testid="label-pills" />,
}));

vi.mock("@/components/tasks/recurrence-picker", () => ({
  RecurrencePicker: () => <div data-testid="recurrence-picker" />,
  DEFAULT_RECURRENCE: {
    enabled: false,
    cadenceType: "daily",
    intervalN: 1,
    daysOfWeek: [],
    dayOfMonth: null,
    timeOfDay: "09:00",
  },
}));

vi.mock("@/components/tasks/recurrence-scope-dialog", () => ({
  RecurrenceScopeDialog: () => null,
}));

vi.mock("@/components/tasks/task-model-override", () => ({
  TaskModelOverride: () => <div data-testid="model-override" />,
}));

vi.mock("@/components/shared/entity-link-list", () => ({
  EntityLinkList: () => <div data-testid="entity-links" />,
}));

vi.mock("@/components/onboarding/micro-tip", () => ({
  MicroTip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid="responsive-dialog">{children}</div> : null),
  ResponsiveDialogContent: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <div data-testid="dialog-content">{children}</div>,
  ResponsiveDialogTitle: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <h2>{children}</h2>,
  ResponsiveDialogDescription: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <p>{children}</p>,
}));

vi.mock("@/components/ui/date-picker-button", () => ({
  DatePickerButton: ({
    value,
    placeholder,
  }: {
    value: string | null;
    placeholder: string;
  }) => <button data-testid="date-picker">{value ?? placeholder}</button>,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <span data-testid="spinner" />,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { TaskForm } from "@/components/tasks/task-form";

const defaultProps = {
  streams: [
    {
      id: "stream-1",
      name: "Engineering",
      color: "#3b82f6",
      type: "functional" as const,
      description: null,
      icon: null,
      is_archived: false,
      sort_order: 0,
      meta: {},
      created_at: "",
      updated_at: "",
    },
  ],
  editingTask: null,
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  resetTaskCounter();
  vi.clearAllMocks();
  mockSupabase = createMockSupabaseClient({
    tables: new Map([
      ["agents", { select: { data: [{ id: "agent-1", name: "TestBot", slug: "testbot", avatar_url: null }], error: null } }],
      ["tasks", {
        select: { data: [], error: null },
        insert: { data: [{ id: "new-task-1" }], error: null },
        update: { data: [], error: null },
      }],
      ["task_series", { select: { data: [], error: null } }],
    ]),
  });
});

describe("TaskForm", () => {
  it("renders in create mode with empty title", () => {
    render(<TaskForm {...defaultProps} />);
    const titleInput = screen.getByPlaceholderText("What needs to be done?");
    expect(titleInput).toBeDefined();
    expect((titleInput as HTMLTextAreaElement).value).toBe("");
  });

  it("renders Create button in new mode", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText("Create")).toBeDefined();
  });

  it("renders in edit mode with pre-filled title", () => {
    const task = buildTask({ title: "Existing task", id: "edit-1" });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    const titleInput = screen.getByPlaceholderText("Task title");
    expect((titleInput as HTMLTextAreaElement).value).toBe("Existing task");
  });

  it("renders Close button in edit mode", () => {
    const task = buildTask({ title: "Existing", id: "edit-1" });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    expect(screen.getByText("Close")).toBeDefined();
  });

  it("renders Edit task dialog title in edit mode", () => {
    const task = buildTask({ title: "Existing", id: "edit-1" });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    expect(screen.getByText("Edit task")).toBeDefined();
  });

  it("renders New task dialog title in create mode", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText("New task")).toBeDefined();
  });

  it("shows description placeholder", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByPlaceholderText("Add a description...")).toBeDefined();
  });

  it("shows status selector with default To Do", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText("To Do")).toBeDefined();
  });

  it("shows priority selector with default Medium", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText("Medium")).toBeDefined();
  });

  it("shows stream selector with None default", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getAllByText("None").length).toBeGreaterThanOrEqual(1);
  });

  it("shows assignee selector with Unassigned default", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByText("Unassigned")).toBeDefined();
  });

  it("shows date picker with placeholder", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByTestId("date-picker")).toBeDefined();
    expect(screen.getByTestId("date-picker").textContent).toBe("None");
  });

  it("disables Create button when title is empty", () => {
    render(<TaskForm {...defaultProps} />);
    const createBtn = screen.getByText("Create");
    expect(createBtn.closest("button")?.disabled).toBe(true);
  });

  it("enables Create button when title is entered", async () => {
    const user = userEvent.setup();
    render(<TaskForm {...defaultProps} />);
    const titleInput = screen.getByPlaceholderText("What needs to be done?");
    await user.type(titleInput, "New task title");
    const createBtn = screen.getByText("Create");
    expect(createBtn.closest("button")?.disabled).toBe(false);
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<TaskForm {...defaultProps} onCancel={onCancel} />);
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows entity link list in create mode", () => {
    render(<TaskForm {...defaultProps} />);
    expect(screen.getByTestId("entity-links")).toBeDefined();
  });

  it("shows timeline when editing a saved task", () => {
    const task = buildTask({ title: "Saved", id: "saved-1" });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    expect(screen.getByTestId("task-timeline")).toBeDefined();
  });

  it("shows Archive button in edit mode when onArchive provided", () => {
    const task = buildTask({ title: "Archivable", id: "arc-1" });
    render(
      <TaskForm
        {...defaultProps}
        editingTask={task as unknown as Task}
        onArchive={vi.fn()}
      />
    );
    expect(screen.getByText("Archive")).toBeDefined();
  });

  it("shows missed task banner when status is missed", () => {
    const task = buildTask({
      title: "Missed one",
      id: "missed-1",
      status: "missed",
      due_date: "2025-01-01",
    });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    expect(
      screen.getByText(/This task missed its deadline/)
    ).toBeDefined();
    expect(screen.getByText("Reopen")).toBeDefined();
  });

  it("shows deliverables section when task has deliverables", () => {
    const task = buildTask({
      title: "Agent task",
      id: "agent-task-1",
      assignee_type: "agent",
      assignee_agent_id: "agent-1",
      deliverable_count: 2,
    });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    expect(screen.getByTestId("task-deliverables")).toBeDefined();
  });

  it("pre-fills description in edit mode", () => {
    const task = buildTask({
      title: "Described",
      id: "desc-1",
      description: "Some description text",
    });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    const descInput = screen.getByPlaceholderText("Add a description...");
    expect((descInput as HTMLTextAreaElement).value).toBe(
      "Some description text"
    );
  });

  it("uses defaultTitle prop when provided", () => {
    render(<TaskForm {...defaultProps} defaultTitle="Prefilled title" />);
    const titleInput = screen.getByPlaceholderText("What needs to be done?");
    expect((titleInput as HTMLTextAreaElement).value).toBe("Prefilled title");
  });

  it("shows subtask section for parent tasks in edit mode", () => {
    const task = buildTask({ title: "Parent task", id: "parent-1", parent_id: null });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    expect(screen.getByTestId("task-subtasks")).toBeDefined();
  });

  it("does not show subtask section for subtasks (tasks with parent_id)", () => {
    const task = buildTask({ title: "Child task", id: "child-1", parent_id: "parent-1" });
    render(<TaskForm {...defaultProps} editingTask={task as unknown as Task} />);
    expect(screen.queryByTestId("task-subtasks")).toBeNull();
  });

  it("shows parent breadcrumb when editing a subtask with onOpenTask", async () => {
    const task = buildTask({ title: "Child task", id: "child-1", parent_id: "parent-1" });
    const onOpenTask = vi.fn();

    // Mock the parent task fetch
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: [{ id: "agent-1", name: "TestBot", slug: "testbot", avatar_url: null }], error: null } }],
        ["tasks", {
          select: { data: [{ id: "parent-1", title: "Parent Task Title" }], error: null },
          insert: { data: [{ id: "new-task-1" }], error: null },
          update: { data: [], error: null },
        }],
        ["task_series", { select: { data: [], error: null } }],
      ]),
    });

    render(
      <TaskForm
        {...defaultProps}
        editingTask={task as unknown as Task}
        onOpenTask={onOpenTask}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Parent Task Title")).toBeDefined();
    });
  });

  it("submits form on Create click", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TaskForm {...defaultProps} onSave={onSave} />);

    const titleInput = screen.getByPlaceholderText("What needs to be done?");
    await user.type(titleInput, "My new task");
    await user.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });
});
