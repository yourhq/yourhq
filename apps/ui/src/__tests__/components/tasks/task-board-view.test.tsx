import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildTask, resetTaskCounter } from "@/__tests__/helpers/factories/task";
import type { Task } from "@/lib/tasks/types";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDraggable: () => ({
    setNodeRef: vi.fn(),
    listeners: {},
    attributes: {},
    isDragging: false,
  }),
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/components/tasks/task-card", () => ({
  TaskCard: ({
    task,
    onClick,
  }: {
    task: Task;
    onClick: () => void;
    onArchive?: (id: string) => void;
  }) => (
    <div data-testid={`task-card-${task.id}`} onClick={onClick}>
      {task.title}
    </div>
  ),
}));

vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({
    children,
  }: {
    children: React.ReactNode;
    defaultOpen?: boolean;
  }) => <div>{children}</div>,
  CollapsibleContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div>{children}</div>,
  CollapsibleTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { TaskBoardView } from "@/components/tasks/task-board-view";

beforeEach(() => {
  resetTaskCounter();
  vi.clearAllMocks();
});

describe("TaskBoardView", () => {
  const defaultProps = {
    tasks: [] as Task[],
    loading: false,
    onStatusChange: vi.fn(),
    onSelect: vi.fn(),
  };

  it("renders loading skeletons when loading", () => {
    render(<TaskBoardView {...defaultProps} loading={true} />);
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders four columns: To Do, In Progress, Blocked, Done", () => {
    render(<TaskBoardView {...defaultProps} />);
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("does not show Cancelled and Missed columns", () => {
    render(<TaskBoardView {...defaultProps} />);
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
    expect(screen.queryByText("Missed")).not.toBeInTheDocument();
  });

  it("renders task cards in the correct columns", () => {
    const tasks = [
      buildTask({ title: "Task A", status: "todo" }) as Task,
      buildTask({ title: "Task B", status: "in_progress" }) as Task,
      buildTask({ title: "Task C", status: "done" }) as Task,
    ];
    render(<TaskBoardView {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.getByText("Task C")).toBeInTheDocument();
  });

  it("shows column counts", () => {
    const tasks = [
      buildTask({ title: "A", status: "todo" }) as Task,
      buildTask({ title: "B", status: "todo" }) as Task,
      buildTask({ title: "C", status: "in_progress" }) as Task,
    ];
    render(<TaskBoardView {...defaultProps} tasks={tasks} />);
    const counts = screen.getAllByText("2");
    expect(counts.length).toBeGreaterThan(0);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows hidden count for cancelled/missed tasks", () => {
    const tasks = [
      buildTask({ title: "A", status: "todo" }) as Task,
      buildTask({ title: "B", status: "cancelled" }) as Task,
      buildTask({ title: "C", status: "missed" }) as Task,
    ];
    render(<TaskBoardView {...defaultProps} tasks={tasks} />);
    expect(
      screen.getByText(/2 cancelled\/missed tasks hidden from board/)
    ).toBeInTheDocument();
  });

  it("shows singular hidden message for one hidden task", () => {
    const tasks = [
      buildTask({ title: "A", status: "cancelled" }) as Task,
    ];
    render(<TaskBoardView {...defaultProps} tasks={tasks} />);
    expect(
      screen.getByText(/1 cancelled\/missed task hidden from board/)
    ).toBeInTheDocument();
  });

  it("does not show hidden count when all tasks fit in board columns", () => {
    const tasks = [
      buildTask({ title: "A", status: "todo" }) as Task,
    ];
    render(<TaskBoardView {...defaultProps} tasks={tasks} />);
    expect(screen.queryByText(/hidden from board/)).not.toBeInTheDocument();
  });

  it("shows Add task buttons when onQuickCreate is provided", () => {
    render(
      <TaskBoardView
        {...defaultProps}
        onQuickCreate={vi.fn()}
      />
    );
    const addButtons = screen.getAllByText("Add task");
    expect(addButtons.length).toBe(4);
  });

  it("does not show Add task buttons when onQuickCreate is not provided", () => {
    render(<TaskBoardView {...defaultProps} />);
    expect(screen.queryByText("Add task")).not.toBeInTheDocument();
  });

  it("shows Empty in columns with no tasks and no quick create", () => {
    render(<TaskBoardView {...defaultProps} tasks={[]} />);
    const empties = screen.getAllByText("Empty");
    expect(empties.length).toBe(4);
  });

  it("renders add task buttons with column-specific aria labels", () => {
    render(
      <TaskBoardView
        {...defaultProps}
        onQuickCreate={vi.fn()}
      />
    );
    expect(screen.getByLabelText("Add task to To Do")).toBeInTheDocument();
    expect(screen.getByLabelText("Add task to In Progress")).toBeInTheDocument();
    expect(screen.getByLabelText("Add task to Blocked")).toBeInTheDocument();
    expect(screen.getByLabelText("Add task to Done")).toBeInTheDocument();
  });
});
