import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildTask } from "@/__tests__/helpers/factories/task";
import { buildLabel } from "@/__tests__/helpers/factories/label";

vi.mock("@/components/tasks/agent-status-chip", () => ({
  AgentStatusChip: ({ task }: { task: { assignee_agent?: { name: string } | null } }) => (
    <span data-testid="agent-status-chip">{task.assignee_agent?.name}</span>
  ),
}));

vi.mock("@/components/tasks/task-labels-picker", () => ({
  TaskLabelPills: ({ labels }: { labels: { id: string; name: string }[] }) => (
    <div data-testid="label-pills">
      {labels.map((l) => (
        <span key={l.id}>{l.name}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/lib/tasks/cadence", () => ({
  shortCadenceLabel: () => "Daily",
}));

import { TaskCard } from "@/components/tasks/task-card";

describe("TaskCard", () => {
  it("renders task title", () => {
    const task = buildTask({ title: "Fix the login bug" });
    render(<TaskCard task={task} />);
    expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
  });

  it("shows priority stripe when priority is set", () => {
    const task = buildTask({ priority: "high" });
    const { container } = render(<TaskCard task={task} />);
    const stripe = container.querySelector("span[aria-hidden]");
    expect(stripe).toBeInTheDocument();
    expect(stripe).toHaveStyle({ backgroundColor: "var(--priority-high)" });
  });

  it("shows assignee chip when assignee is an agent", () => {
    const task = buildTask({
      assignee_type: "agent",
      assignee_agent: { id: "a-1", name: "ResearchBot", slug: "researchbot", avatar_url: null },
    });
    render(<TaskCard task={task} />);
    expect(screen.getByTestId("agent-status-chip")).toHaveTextContent("ResearchBot");
  });

  it("shows human assignee when assignee_type is human", () => {
    const task = buildTask({ assignee_type: "human" });
    render(<TaskCard task={task} />);
    expect(screen.getByText("Me")).toBeInTheDocument();
  });

  it("shows subtask progress when subtask_count > 0", () => {
    const task = buildTask({ subtask_count: 4, subtask_done_count: 3 });
    render(<TaskCard task={task} />);
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("does not show subtask progress when subtask_count is 0", () => {
    const task = buildTask({ subtask_count: 0, subtask_done_count: 0 });
    render(<TaskCard task={task} />);
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
  });

  it("shows label pills when labels are present", () => {
    const labels = [
      buildLabel({ name: "Bug" }),
      buildLabel({ name: "Urgent" }),
    ];
    const task = buildTask({ labels });
    render(<TaskCard task={task} />);
    expect(screen.getByTestId("label-pills")).toBeInTheDocument();
    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });
});
