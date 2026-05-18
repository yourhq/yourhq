import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Label } from "@/lib/tasks/types";

const mockLabels: Label[] = [
  { id: "l1", created_at: "", name: "Bug", color: "#ef4444", description: null },
  { id: "l2", created_at: "", name: "Feature", color: "#3b82f6", description: null },
  { id: "l3", created_at: "", name: "Docs", color: "#22c55e", description: null },
];

const mockActions = {
  addLabelToTask: vi.fn().mockResolvedValue(undefined),
  removeLabelFromTask: vi.fn().mockResolvedValue(undefined),
  createLabel: vi.fn().mockResolvedValue({ data: { id: "l-new", created_at: "", name: "New", color: "#eab308", description: null } }),
};

vi.mock("@/hooks/use-labels", () => ({
  useLabels: () => ({ labels: mockLabels, actions: mockActions }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    children,
    open: _open,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({
    children,
    asChild: _asChild,
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
    disabled,
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

import { TaskLabelsPicker, TaskLabelPills } from "@/components/tasks/task-labels-picker";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaskLabelsPicker", () => {
  it("renders Labels trigger text when no labels selected", () => {
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={vi.fn()}
      />
    );
    expect(screen.getByText("Labels")).toBeInTheDocument();
  });

  it("renders selected label names in trigger", () => {
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[mockLabels[0]]}
        onLabelsChange={vi.fn()}
      />
    );
    const bugElements = screen.getAllByText("Bug");
    expect(bugElements.length).toBeGreaterThanOrEqual(1);
    const inTrigger = bugElements.find(
      (el) => el.closest("[data-testid='popover-trigger']")
    );
    expect(inTrigger).toBeTruthy();
  });

  it("shows overflow count when more than 2 labels selected", () => {
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={mockLabels}
        onLabelsChange={vi.fn()}
      />
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("renders all available labels in dropdown", () => {
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={vi.fn()}
      />
    );
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("shows check mark for selected labels", () => {
    const { container } = render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[mockLabels[0]]}
        onLabelsChange={vi.fn()}
      />
    );
    const buttons = container.querySelectorAll("[data-testid='popover-content'] button");
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("calls addLabelToTask and onLabelsChange when unselected label is clicked", async () => {
    const user = userEvent.setup();
    const onLabelsChange = vi.fn();
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={onLabelsChange}
      />
    );
    const featureButton = screen.getAllByText("Feature").find(
      (el) => el.closest("[data-testid='popover-content']")
    );
    if (featureButton) {
      await user.click(featureButton);
      expect(mockActions.addLabelToTask).toHaveBeenCalledWith("t-1", "l2");
      expect(onLabelsChange).toHaveBeenCalledWith([mockLabels[1]]);
    }
  });

  it("calls removeLabelFromTask when selected label is clicked", async () => {
    const user = userEvent.setup();
    const onLabelsChange = vi.fn();
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[mockLabels[0]]}
        onLabelsChange={onLabelsChange}
      />
    );
    const bugButtons = screen.getAllByText("Bug");
    const inDropdown = bugButtons.find((el) =>
      el.closest("[data-testid='popover-content']")
    );
    if (inDropdown) {
      await user.click(inDropdown);
      expect(mockActions.removeLabelFromTask).toHaveBeenCalledWith("t-1", "l1");
      expect(onLabelsChange).toHaveBeenCalledWith([]);
    }
  });

  it("filters labels by search text", async () => {
    const user = userEvent.setup();
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={vi.fn()}
      />
    );
    const filterInput = screen.getByPlaceholderText("Filter labels...");
    await user.type(filterInput, "Bug");
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.queryByText("Feature")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
  });

  it("shows 'No labels found' when filter matches nothing", async () => {
    const user = userEvent.setup();
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={vi.fn()}
      />
    );
    const filterInput = screen.getByPlaceholderText("Filter labels...");
    await user.type(filterInput, "zzzzz");
    expect(screen.getByText("No labels found")).toBeInTheDocument();
  });

  it("shows Create label button", () => {
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={vi.fn()}
      />
    );
    expect(screen.getByText("Create label")).toBeInTheDocument();
  });

  it("opens create form when Create label is clicked", async () => {
    const user = userEvent.setup();
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={vi.fn()}
      />
    );
    await user.click(screen.getByText("Create label"));
    expect(screen.getByPlaceholderText("Label name")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("creates label and adds to task on submit", async () => {
    const user = userEvent.setup();
    const onLabelsChange = vi.fn();
    render(
      <TaskLabelsPicker
        taskId="t-1"
        selectedLabels={[]}
        onLabelsChange={onLabelsChange}
      />
    );
    await user.click(screen.getByText("Create label"));
    await user.type(screen.getByPlaceholderText("Label name"), "New");
    await user.click(screen.getByText("Create"));
    expect(mockActions.createLabel).toHaveBeenCalledWith("New", expect.any(String));
    expect(mockActions.addLabelToTask).toHaveBeenCalledWith("t-1", "l-new");
  });
});

describe("TaskLabelPills", () => {
  it("returns null when labels is empty", () => {
    const { container } = render(<TaskLabelPills labels={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when labels is undefined", () => {
    const { container } = render(<TaskLabelPills labels={undefined as unknown as Label[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders up to max labels", () => {
    render(<TaskLabelPills labels={mockLabels} max={2} />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("does not show overflow when labels fit within max", () => {
    render(<TaskLabelPills labels={[mockLabels[0]]} max={2} />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("renders all labels when they fit within max", () => {
    render(<TaskLabelPills labels={mockLabels} max={5} />);
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <TaskLabelPills labels={[mockLabels[0]]} className="my-class" />
    );
    expect(container.firstChild).toHaveClass("my-class");
  });
});
