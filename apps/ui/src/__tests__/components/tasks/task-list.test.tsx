import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildTask, resetTaskCounter } from "@/__tests__/helpers/factories/task";

vi.mock("@/components/shared/loading-skeleton", () => ({
  LoadingSkeleton: ({ variant }: { variant: string }) => (
    <div data-testid="loading-skeleton" data-variant={variant} />
  ),
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title: string;
    description: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

vi.mock("@/components/tasks/agent-status-chip", () => ({
  AgentStatusChip: ({ task }: { task: { assignee_agent?: { name: string } | null } }) => (
    <span data-testid="agent-chip">{task.assignee_agent?.name}</span>
  ),
}));

vi.mock("@/components/tasks/task-labels-picker", () => ({
  TaskLabelPills: ({ labels }: { labels: { name: string }[] }) => (
    <span data-testid="label-pills">
      {labels.map((l) => l.name).join(", ")}
    </span>
  ),
}));

vi.mock("@/lib/tasks/cadence", () => ({
  shortCadenceLabel: () => "Daily",
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} aria-label={rest["aria-label"]}>
      {children}
    </button>
  ),
}));

import { TaskList } from "@/components/tasks/task-list";

const defaultProps = {
  tasks: [] as ReturnType<typeof buildTask>[],
  loading: false,
  sorting: [],
  setSorting: vi.fn(),
  onStatusChange: vi.fn(),
  onSelect: vi.fn(),
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  resetTaskCounter();
  vi.clearAllMocks();
});

describe("TaskList", () => {
  it("renders loading skeleton when loading", () => {
    render(<TaskList {...defaultProps} loading={true} />);
    expect(screen.getByTestId("loading-skeleton")).toBeDefined();
    expect(screen.getByTestId("loading-skeleton").dataset.variant).toBe("list");
  });

  it("renders empty state when no tasks and no active filters", () => {
    render(<TaskList {...defaultProps} tasks={[]} />);
    expect(screen.getByText("No tasks yet")).toBeDefined();
    expect(
      screen.getByText("Create your first task to start tracking work.")
    ).toBeDefined();
  });

  it("renders filtered empty state when no tasks and filters are active", () => {
    render(<TaskList {...defaultProps} tasks={[]} hasActiveFilters />);
    expect(screen.getByText("No matching tasks")).toBeDefined();
    expect(
      screen.getByText(
        "Try adjusting your filters to find what you're looking for."
      )
    ).toBeDefined();
  });

  it("renders New task action when onCreateTask provided and not showing archived", () => {
    const onCreate = vi.fn();
    render(
      <TaskList {...defaultProps} tasks={[]} onCreateTask={onCreate} />
    );
    const btn = screen.getByText("New task");
    expect(btn).toBeDefined();
  });

  it("renders task rows with titles", () => {
    const tasks = [
      buildTask({ title: "Fix login bug" }),
      buildTask({ title: "Write docs" }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Fix login bug")).toBeDefined();
    expect(screen.getByText("Write docs")).toBeDefined();
  });

  it("renders due date for tasks that have one", () => {
    const tasks = [
      buildTask({ title: "Has date", due_date: "2026-12-25" }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Dec 25")).toBeDefined();
  });

  it("shows Overdue for past due dates on non-done tasks", () => {
    const tasks = [
      buildTask({ title: "Late task", due_date: "2020-01-01", status: "todo" }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Overdue")).toBeDefined();
  });

  it("does not show Overdue for done tasks", () => {
    const tasks = [
      buildTask({ title: "Done task", due_date: "2020-01-01", status: "done" }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.queryByText("Overdue")).toBeNull();
  });

  it("shows human assignee label", () => {
    const tasks = [
      buildTask({ title: "My task", assignee_type: "human" }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Me")).toBeDefined();
  });

  it("shows attachment count when present", () => {
    const tasks = [buildTask({ title: "With files", attachment_count: 3 })];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("shows comment count when present", () => {
    const tasks = [buildTask({ title: "With comments", comment_count: 5 })];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("5")).toBeDefined();
  });

  it("shows blocker icon when blocker_count > 0", () => {
    const tasks = [buildTask({ title: "Blocked task", blocker_count: 2 })];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    const blockerSpan = screen.getByTitle("Blocked by 2 tasks");
    expect(blockerSpan).toBeDefined();
  });

  it("calls onSelect when a task row is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const task = buildTask({ title: "Click me" });
    render(<TaskList {...defaultProps} tasks={[task]} onSelect={onSelect} />);

    await user.click(screen.getByText("Click me"));
    expect(onSelect).toHaveBeenCalledWith(task);
  });

  it("calls onStatusChange when toggle done button is clicked", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const task = buildTask({ title: "Toggle me" });
    render(
      <TaskList
        {...defaultProps}
        tasks={[task]}
        onStatusChange={onStatusChange}
      />
    );

    const toggleBtn = screen.getByLabelText("Toggle done");
    await user.click(toggleBtn);
    expect(onStatusChange).toHaveBeenCalledWith(task.id, "done");
  });

  it("toggles done task back to todo", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    const task = buildTask({ title: "Done one", status: "done" });
    render(
      <TaskList
        {...defaultProps}
        tasks={[task]}
        onStatusChange={onStatusChange}
      />
    );

    const toggleBtn = screen.getByLabelText("Toggle done");
    await user.click(toggleBtn);
    expect(onStatusChange).toHaveBeenCalledWith(task.id, "todo");
  });

  it("shows stream name when task has a stream", () => {
    const tasks = [
      buildTask({
        title: "Streamed",
        stream: { id: "s1", name: "Engineering", color: "#3b82f6" },
      }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Engineering")).toBeDefined();
  });

  it("renders label pills when task has labels", () => {
    const tasks = [
      buildTask({
        title: "Labeled",
        labels: [
          { id: "l1", created_at: "", name: "Bug", color: "#ef4444", description: null },
        ],
      }),
    ];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByTestId("label-pills")).toBeDefined();
  });

  it("shows subtask count when task has subtasks", () => {
    const tasks = [buildTask({ title: "Parent", subtask_count: 5, subtask_done_count: 2 })];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("2/5")).toBeDefined();
  });

  it("does not show subtask count when task has no subtasks", () => {
    const tasks = [buildTask({ title: "No subtasks", subtask_count: 0, subtask_done_count: 0 })];
    render(<TaskList {...defaultProps} tasks={tasks} />);
    expect(screen.queryByText("0/0")).toBeNull();
  });

  it("shows archive option in dropdown for non-archived tasks", () => {
    const onArchive = vi.fn();
    const tasks = [buildTask({ title: "Archivable" })];
    render(
      <TaskList {...defaultProps} tasks={tasks} onArchive={onArchive} />
    );
    expect(screen.getByText("Archive")).toBeDefined();
  });

  it("shows restore and delete options in archived mode", () => {
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    const tasks = [buildTask({ title: "Archived task" })];
    render(
      <TaskList
        {...defaultProps}
        tasks={tasks}
        showArchived
        onRestore={onRestore}
        onDelete={onDelete}
      />
    );
    expect(screen.getByText("Restore")).toBeDefined();
    expect(screen.getByText("Delete permanently")).toBeDefined();
  });
});
