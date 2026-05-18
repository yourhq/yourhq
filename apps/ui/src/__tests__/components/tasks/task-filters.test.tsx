import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskFilters } from "@/components/tasks/task-filters";
import type { Stream, Label } from "@/lib/tasks/types";

function makeFilters(overrides: Record<string, unknown> = {}) {
  return {
    streamFilter: "all",
    setStreamFilter: vi.fn(),
    statusFilter: "all",
    setStatusFilter: vi.fn(),
    priorityFilter: "all",
    setPriorityFilter: vi.fn(),
    assigneeFilter: "all",
    setAssigneeFilter: vi.fn(),
    labelFilter: "all",
    setLabelFilter: vi.fn(),
    hasActiveFilters: false,
    clearFilters: vi.fn(),
    ...overrides,
  };
}

function _makeStream(overrides: Partial<Stream> = {}): Stream {
  return {
    id: "stream-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: "Engineering",
    description: null,
    type: "functional",
    color: "#3b82f6",
    icon: null,
    is_archived: false,
    sort_order: 0,
    meta: {},
    ...overrides,
  };
}

function makeLabel(overrides: Partial<Label> = {}): Label {
  return {
    id: "label-1",
    created_at: new Date().toISOString(),
    name: "Bug",
    color: "#ef4444",
    description: null,
    ...overrides,
  };
}

describe("TaskFilters", () => {
  it("renders status, priority, and assignee selects", () => {
    render(
      <TaskFilters filters={makeFilters()} streams={[]} />
    );
    expect(screen.getByText("All statuses")).toBeInTheDocument();
    expect(screen.getByText("All priorities")).toBeInTheDocument();
    expect(screen.getByText("All assignees")).toBeInTheDocument();
  });

  it("renders label filter when labels are provided", () => {
    const labels = [makeLabel()];
    render(
      <TaskFilters filters={makeFilters()} streams={[]} labels={labels} />
    );
    expect(screen.getByText("All labels")).toBeInTheDocument();
  });

  it("does not render label filter when labels are empty", () => {
    render(
      <TaskFilters filters={makeFilters()} streams={[]} labels={[]} />
    );
    expect(screen.queryByText("All labels")).not.toBeInTheDocument();
  });

  it("shows Clear all button when hasActiveFilters is true", () => {
    render(
      <TaskFilters
        filters={makeFilters({ hasActiveFilters: true })}
        streams={[]}
      />
    );
    expect(screen.getByText("Clear all")).toBeInTheDocument();
  });

  it("calls clearFilters when Clear all is clicked", async () => {
    const user = userEvent.setup();
    const clearFilters = vi.fn();
    render(
      <TaskFilters
        filters={makeFilters({ hasActiveFilters: true, clearFilters })}
        streams={[]}
      />
    );
    await user.click(screen.getByText("Clear all"));
    expect(clearFilters).toHaveBeenCalled();
  });
});
