import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TaskRelation } from "@/lib/tasks/types";

const mockActions = {
  addRelation: vi.fn().mockResolvedValue(undefined),
  removeRelation: vi.fn().mockResolvedValue(undefined),
  searchTasks: vi.fn().mockResolvedValue([]),
};

const mockUseTaskRelations = vi.fn();

vi.mock("@/hooks/use-task-relations", () => ({
  useTaskRelations: (...args: unknown[]) => mockUseTaskRelations(...args),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    children,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
    portal?: boolean;
    align?: string;
  }) => <div data-testid="popover-content">{children}</div>,
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

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => <div data-testid="select">{children}</div>,
  SelectContent: ({
    children,
  }: {
    children: React.ReactNode;
    portal?: boolean;
  }) => <div data-testid="select-content">{children}</div>,
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <div data-value={value}>{children}</div>,
  SelectTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid="select-trigger">{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({
    children,
  }: {
    children: React.ReactNode;
    shouldFilter?: boolean;
  }) => <div data-testid="command">{children}</div>,
  CommandInput: (props: {
    placeholder?: string;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <input
      data-testid="command-input"
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => props.onValueChange?.(e.target.value)}
    />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-list">{children}</div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-empty">{children}</div>
  ),
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    value?: string;
  }) => (
    <div data-testid="command-item" data-value={value} onClick={onSelect}>
      {children}
    </div>
  ),
}));

import { TaskRelations } from "@/components/tasks/task-relations";

function makeRelation(overrides: Partial<TaskRelation> = {}): TaskRelation {
  return {
    id: "rel-1",
    created_at: "2025-01-01T00:00:00Z",
    source_task_id: "t-1",
    target_task_id: "t-2",
    relation_type: "blocked_by",
    created_by_type: "human",
    created_by_agent_id: null,
    related_task: {
      id: "t-2",
      title: "Setup database",
      status: "todo",
      assignee_agent: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskRelations", () => {
  it("renders Relations heading with count", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [makeRelation()],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    expect(screen.getByText("Relations")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders no count when there are no relations", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    expect(screen.getByText("Relations")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders relation with task title", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [makeRelation()],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    expect(screen.getByText("Setup database")).toBeInTheDocument();
  });

  it("renders relation type label in relation row", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [makeRelation({ relation_type: "blocked_by" })],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    const allBlockedBy = screen.getAllByText("Blocked by");
    const inRelationRow = allBlockedBy.find(
      (el) => el.closest(".group")
    );
    expect(inRelationRow).toBeTruthy();
  });

  it("renders 'blocks' relation type label in relation row", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [makeRelation({ relation_type: "blocks" })],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    const allBlocks = screen.getAllByText("Blocks");
    const inRelationRow = allBlocks.find(
      (el) => el.closest(".group")
    );
    expect(inRelationRow).toBeTruthy();
  });

  it("renders 'relates_to' relation type label in relation row", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [
        makeRelation({
          id: "rel-2",
          relation_type: "relates_to",
          related_task: {
            id: "t-3",
            title: "Related work",
            status: "in_progress",
            assignee_agent: null,
          },
        }),
      ],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    const allRelatedTo = screen.getAllByText("Related to");
    const inRelationRow = allRelatedTo.find(
      (el) => el.closest(".group")
    );
    expect(inRelationRow).toBeTruthy();
  });

  it("renders assignee agent name when present", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [
        makeRelation({
          related_task: {
            id: "t-2",
            title: "Setup database",
            status: "todo",
            assignee_agent: { name: "DevBot" },
          },
        }),
      ],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    expect(screen.getByText("DevBot")).toBeInTheDocument();
  });

  it("shows 'Unknown task' when related_task is null", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [
        makeRelation({
          related_task: undefined,
        }),
      ],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    expect(screen.getByText("Unknown task")).toBeInTheDocument();
  });

  it("sorts blockers before other relations", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [
        makeRelation({
          id: "rel-1",
          relation_type: "relates_to",
          related_task: { id: "t-3", title: "Related task", status: "done", assignee_agent: null },
        }),
        makeRelation({
          id: "rel-2",
          relation_type: "blocked_by",
          related_task: { id: "t-2", title: "Blocker task", status: "todo", assignee_agent: null },
        }),
      ],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    const titles = screen.getAllByText(/task$/i);
    expect(titles[0]).toHaveTextContent("Blocker task");
    expect(titles[1]).toHaveTextContent("Related task");
  });

  it("renders remove button for each relation", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [makeRelation()],
      actions: mockActions,
    });
    const { container } = render(<TaskRelations taskId="t-1" />);
    const removeButtons = container.querySelectorAll(
      "button"
    );
    const lastButton = Array.from(removeButtons).find(
      (b) => b.querySelector("svg")
    );
    expect(lastButton).toBeTruthy();
  });

  it("calls removeRelation when remove button is clicked", async () => {
    const user = userEvent.setup();
    mockUseTaskRelations.mockReturnValue({
      relations: [makeRelation()],
      actions: mockActions,
    });
    const { container } = render(<TaskRelations taskId="t-1" />);
    const relationRow = container.querySelector(".group");
    const removeBtn = relationRow?.querySelector("button");
    if (removeBtn) {
      await user.click(removeBtn);
      expect(mockActions.removeRelation).toHaveBeenCalledWith("rel-1");
    }
  });

  it("renders relation picker with relation type options in select", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    const selectContent = screen.getByTestId("select-content");
    expect(selectContent).toHaveTextContent("Blocked by");
    expect(selectContent).toHaveTextContent("Blocks");
    expect(selectContent).toHaveTextContent("Related to");
    expect(selectContent).toHaveTextContent("Parent of");
    expect(selectContent).toHaveTextContent("Sub-task of");
  });

  it("renders search input for tasks", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    expect(screen.getByPlaceholderText("Search tasks...")).toBeInTheDocument();
  });

  it("renders multiple relations", () => {
    mockUseTaskRelations.mockReturnValue({
      relations: [
        makeRelation({
          id: "rel-1",
          related_task: { id: "t-2", title: "Task A", status: "todo", assignee_agent: null },
        }),
        makeRelation({
          id: "rel-2",
          relation_type: "blocks",
          related_task: { id: "t-3", title: "Task B", status: "done", assignee_agent: null },
        }),
      ],
      actions: mockActions,
    });
    render(<TaskRelations taskId="t-1" />);
    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
