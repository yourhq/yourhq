import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resetTaskCounter } from "@/__tests__/helpers/factories/task";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={rest["aria-label"]}>
      {children}
    </button>
  ),
}));

import { TaskSubtasks } from "@/components/tasks/task-subtasks";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  resetTaskCounter();
  vi.clearAllMocks();
  mockSupabase = createMockSupabaseClient({
    tables: new Map([
      [
        "tasks",
        {
          select: { data: [], error: null },
          insert: {
            data: [
              {
                id: "new-subtask-1",
                title: "New subtask",
                status: "todo",
                priority: "medium",
                parent_id: "parent-1",
                assignee_type: null,
                assignee_agent: null,
                due_date: null,
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
            error: null,
          },
          update: { data: [], error: null },
        },
      ],
    ]),
  });
});

function mockWithSubtasks(subtasks: Record<string, unknown>[]) {
  mockSupabase = createMockSupabaseClient({
    tables: new Map([
      [
        "tasks",
        {
          select: { data: subtasks, error: null },
          insert: {
            data: [
              {
                id: "new-subtask-1",
                title: "New subtask",
                status: "todo",
                priority: "medium",
                parent_id: "parent-1",
                assignee_type: null,
                assignee_agent: null,
                due_date: null,
                created_at: "2026-01-01T00:00:00Z",
              },
            ],
            error: null,
          },
          update: { data: [], error: null },
        },
      ],
    ]),
  });
}

describe("TaskSubtasks", () => {
  it("renders the Subtasks header", async () => {
    render(<TaskSubtasks taskId="parent-1" />);
    expect(screen.getByText("Subtasks")).toBeDefined();
  });

  it("shows done/total count when subtasks exist", async () => {
    mockWithSubtasks([
      { id: "s1", title: "Sub one", status: "done", assignee_type: null, assignee_agent: null, due_date: null },
      { id: "s2", title: "Sub two", status: "todo", assignee_type: null, assignee_agent: null, due_date: null },
      { id: "s3", title: "Sub three", status: "in_progress", assignee_type: null, assignee_agent: null, due_date: null },
    ]);
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Sub one")).toBeDefined();
    });
    expect(screen.getByText("1/3")).toBeDefined();
  });

  it("renders subtask titles after loading", async () => {
    mockWithSubtasks([
      { id: "s1", title: "First subtask", status: "todo", assignee_type: null, assignee_agent: null, due_date: null },
      { id: "s2", title: "Second subtask", status: "done", assignee_type: null, assignee_agent: null, due_date: null },
    ]);
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("First subtask")).toBeDefined();
      expect(screen.getByText("Second subtask")).toBeDefined();
    });
  });

  it("shows progress bar when subtasks exist", async () => {
    mockWithSubtasks([
      { id: "s1", title: "Done", status: "done", assignee_type: null, assignee_agent: null, due_date: null },
      { id: "s2", title: "Todo", status: "todo", assignee_type: null, assignee_agent: null, due_date: null },
    ]);
    const { container } = render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Done")).toBeDefined();
    });
    const progressBar = container.querySelector("[style*='width: 50%']");
    expect(progressBar).toBeDefined();
    expect(progressBar).not.toBeNull();
  });

  it("does not show progress bar when no subtasks", async () => {
    const { container } = render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Subtasks")).toBeDefined();
    });
    const progressBar = container.querySelector(".bg-\\[var\\(--status-success\\)\\]");
    expect(progressBar).toBeNull();
  });

  it("shows add input when plus button is clicked", async () => {
    const user = userEvent.setup();
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Subtasks")).toBeDefined();
    });
    const addButtons = screen.getAllByRole("button");
    const plusButton = addButtons.find((btn) => !btn.textContent);
    if (plusButton) await user.click(plusButton);
    expect(screen.getByPlaceholderText("Add subtask...")).toBeDefined();
  });

  it("creates a subtask on Enter", async () => {
    const user = userEvent.setup();
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Subtasks")).toBeDefined();
    });

    const addButtons = screen.getAllByRole("button");
    const plusButton = addButtons.find((btn) => !btn.textContent);
    if (plusButton) await user.click(plusButton);

    const input = screen.getByPlaceholderText("Add subtask...");
    await user.type(input, "New subtask{enter}");

    await waitFor(() => {
      expect(mockSupabase.from).toHaveBeenCalledWith("tasks");
      expect(logAudit).toHaveBeenCalled();
    });
  });

  it("does not create subtask if title is empty", async () => {
    const user = userEvent.setup();
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Subtasks")).toBeDefined();
    });

    const addButtons = screen.getAllByRole("button");
    const plusButton = addButtons.find((btn) => !btn.textContent);
    if (plusButton) await user.click(plusButton);

    const input = screen.getByPlaceholderText("Add subtask...");
    await user.type(input, "{enter}");

    const insertCalls = mockSupabase.from.mock.calls.filter(
      ([table]: [string]) => table === "tasks"
    );
    // Only the initial fetch call, no insert
    expect(insertCalls.length).toBe(1);
  });

  it("closes add input on Escape", async () => {
    const user = userEvent.setup();
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Subtasks")).toBeDefined();
    });

    const addButtons = screen.getAllByRole("button");
    const plusButton = addButtons.find((btn) => !btn.textContent);
    if (plusButton) await user.click(plusButton);

    const input = screen.getByPlaceholderText("Add subtask...");
    await user.type(input, "{Escape}");

    expect(screen.queryByPlaceholderText("Add subtask...")).toBeNull();
  });

  it("shows toast on create error", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        [
          "tasks",
          {
            select: { data: [], error: null },
            insert: { data: null, error: { message: "Insert failed" } },
          },
        ],
      ]),
    });

    const user = userEvent.setup();
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Subtasks")).toBeDefined();
    });

    const addButtons = screen.getAllByRole("button");
    const plusButton = addButtons.find((btn) => !btn.textContent);
    if (plusButton) await user.click(plusButton);

    const input = screen.getByPlaceholderText("Add subtask...");
    await user.type(input, "Will fail{enter}");

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to create subtask", {
        description: "Insert failed",
      });
    });
  });

  it("calls onOpenSubtask when subtask row is clicked", async () => {
    const onOpenSubtask = vi.fn();
    mockWithSubtasks([
      { id: "s1", title: "Click me", status: "todo", assignee_type: null, assignee_agent: null, due_date: null },
    ]);
    render(<TaskSubtasks taskId="parent-1" onOpenSubtask={onOpenSubtask} />);
    await waitFor(() => {
      expect(screen.getByText("Click me")).toBeDefined();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Click me"));
    expect(onOpenSubtask).toHaveBeenCalled();
    expect(onOpenSubtask.mock.calls[0][0]).toHaveProperty("id", "s1");
  });

  it("shows agent assignee on subtask", async () => {
    mockWithSubtasks([
      {
        id: "s1",
        title: "Agent task",
        status: "todo",
        assignee_type: "agent",
        assignee_agent: { id: "a1", name: "ResearchBot", slug: "researchbot", avatar_url: null, meta: {} },
        due_date: null,
      },
    ]);
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("ResearchBot")).toBeDefined();
    });
  });

  it("shows due date on subtask", async () => {
    mockWithSubtasks([
      {
        id: "s1",
        title: "Dated",
        status: "todo",
        assignee_type: null,
        assignee_agent: null,
        due_date: "2026-12-25",
      },
    ]);
    render(<TaskSubtasks taskId="parent-1" />);
    await waitFor(() => {
      expect(screen.getByText("Dec 25")).toBeDefined();
    });
  });

  it("passes streamId to newly created subtask", async () => {
    const user = userEvent.setup();
    render(<TaskSubtasks taskId="parent-1" streamId="stream-1" />);
    await waitFor(() => {
      expect(screen.getByText("Subtasks")).toBeDefined();
    });

    const addButtons = screen.getAllByRole("button");
    const plusButton = addButtons.find((btn) => !btn.textContent);
    if (plusButton) await user.click(plusButton);

    const input = screen.getByPlaceholderText("Add subtask...");
    await user.type(input, "Streamed subtask{enter}");

    await waitFor(() => {
      const fromCalls = mockSupabase.from.mock.calls;
      const taskCalls = fromCalls.filter(([t]: [string]) => t === "tasks");
      expect(taskCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
