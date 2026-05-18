import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildTask, resetTaskCounter } from "@/__tests__/helpers/factories/task";
import { format, addMonths, subMonths } from "date-fns";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
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

import { TaskCalendarView } from "@/components/tasks/task-calendar-view";

const defaultProps = {
  tasks: [] as ReturnType<typeof buildTask>[],
  loading: false,
  onSelect: vi.fn(),
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  resetTaskCounter();
  vi.clearAllMocks();
});

describe("TaskCalendarView", () => {
  it("renders the current month heading", () => {
    render(<TaskCalendarView {...defaultProps} />);
    const expected = format(new Date(), "MMMM yyyy");
    expect(screen.getByText(expected)).toBeDefined();
  });

  it("renders day-of-week headers", () => {
    render(<TaskCalendarView {...defaultProps} />);
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      const elements = screen.getAllByText(day);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders Today button", () => {
    render(<TaskCalendarView {...defaultProps} />);
    expect(screen.getByText("Today")).toBeDefined();
  });

  it("navigates to previous month", async () => {
    const user = userEvent.setup();
    render(<TaskCalendarView {...defaultProps} />);

    const currentMonth = format(new Date(), "MMMM yyyy");
    expect(screen.getByText(currentMonth)).toBeDefined();

    const prevButtons = screen.getAllByRole("button");
    await user.click(prevButtons[0]);

    const expected = format(subMonths(new Date(), 1), "MMMM yyyy");
    expect(screen.getByText(expected)).toBeDefined();
  });

  it("navigates to next month", async () => {
    const user = userEvent.setup();
    render(<TaskCalendarView {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[1]);

    const expected = format(addMonths(new Date(), 1), "MMMM yyyy");
    expect(screen.getByText(expected)).toBeDefined();
  });

  it("returns to current month when Today is clicked after navigating", async () => {
    const user = userEvent.setup();
    render(<TaskCalendarView {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[1]);
    await user.click(buttons[1]);

    await user.click(screen.getByText("Today"));

    const expected = format(new Date(), "MMMM yyyy");
    expect(screen.getByText(expected)).toBeDefined();
  });

  it("shows tasks on their due dates", () => {
    const today = new Date();
    const dateStr = format(today, "yyyy-MM-dd");
    const tasks = [
      buildTask({ title: "Today's task", due_date: dateStr }),
    ];
    render(<TaskCalendarView {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Today's task")).toBeDefined();
  });

  it("shows multiple tasks on the same date", () => {
    const today = new Date();
    const dateStr = format(today, "yyyy-MM-dd");
    const tasks = [
      buildTask({ title: "Task A", due_date: dateStr }),
      buildTask({ title: "Task B", due_date: dateStr }),
    ];
    render(<TaskCalendarView {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Task A")).toBeDefined();
    expect(screen.getByText("Task B")).toBeDefined();
  });

  it("shows overflow indicator for more than 3 tasks on a day", () => {
    const today = new Date();
    const dateStr = format(today, "yyyy-MM-dd");
    const tasks = [
      buildTask({ title: "T1", due_date: dateStr }),
      buildTask({ title: "T2", due_date: dateStr }),
      buildTask({ title: "T3", due_date: dateStr }),
      buildTask({ title: "T4", due_date: dateStr }),
      buildTask({ title: "T5", due_date: dateStr }),
    ];
    render(<TaskCalendarView {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("+2 more")).toBeDefined();
  });

  it("does not render tasks without due dates", () => {
    const tasks = [
      buildTask({ title: "No date task", due_date: null }),
    ];
    render(<TaskCalendarView {...defaultProps} tasks={tasks} />);
    expect(screen.queryByText("No date task")).toBeNull();
  });

  it("calls onSelect when a task is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const today = new Date();
    const dateStr = format(today, "yyyy-MM-dd");
    const task = buildTask({ title: "Clickable task", due_date: dateStr });
    render(
      <TaskCalendarView {...defaultProps} tasks={[task]} onSelect={onSelect} />
    );

    await user.click(screen.getByText("Clickable task"));
    expect(onSelect).toHaveBeenCalledWith(task);
  });

  it("applies line-through and opacity to done tasks", () => {
    const today = new Date();
    const dateStr = format(today, "yyyy-MM-dd");
    const tasks = [
      buildTask({ title: "Completed task", due_date: dateStr, status: "done" }),
    ];
    render(<TaskCalendarView {...defaultProps} tasks={tasks} />);
    const taskEl = screen.getByText("Completed task");
    const button = taskEl.closest("button");
    expect(button?.className).toContain("line-through");
    expect(button?.className).toContain("opacity-60");
  });

  it("renders tasks from series_occurrence_at when no due_date", () => {
    const today = new Date();
    const dateStr = format(today, "yyyy-MM-dd");
    const tasks = [
      buildTask({
        title: "Series task",
        due_date: null,
        series_occurrence_at: dateStr + "T09:00:00Z",
      }),
    ];
    render(<TaskCalendarView {...defaultProps} tasks={tasks} />);
    expect(screen.getByText("Series task")).toBeDefined();
  });
});
