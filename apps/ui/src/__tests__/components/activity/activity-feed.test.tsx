import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuditLogEntry } from "@/lib/audit/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/shared/loading-skeleton", () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton">Loading...</div>,
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}));

import { ActivityFeed } from "@/components/activity/activity-feed";

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "entry-1",
    created_at: "2025-06-01T10:00:00Z",
    actor_type: "human",
    actor_agent_id: null,
    module: "tasks",
    entity_type: "task",
    entity_id: "task-1",
    action: "created",
    summary: "Created a new task",
    changes: null,
    meta: {},
    ...overrides,
  };
}

describe("ActivityFeed", () => {
  it("renders loading skeleton when loading with no entries", () => {
    render(
      <ActivityFeed
        entries={[]}
        loading={true}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("renders empty state when no entries and not loading", () => {
    render(
      <ActivityFeed
        entries={[]}
        loading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(
      screen.getByText("Actions by you and agents will appear here."),
    ).toBeInTheDocument();
  });

  it("renders entries", () => {
    render(
      <ActivityFeed
        entries={[makeEntry()]}
        loading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByText("Created a new task")).toBeInTheDocument();
  });

  it("renders multiple entries", () => {
    render(
      <ActivityFeed
        entries={[
          makeEntry({ id: "e1", summary: "First action" }),
          makeEntry({ id: "e2", summary: "Second action" }),
          makeEntry({ id: "e3", summary: "Third action" }),
        ]}
        loading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByText("First action")).toBeInTheDocument();
    expect(screen.getByText("Second action")).toBeInTheDocument();
    expect(screen.getByText("Third action")).toBeInTheDocument();
  });

  it("shows 'Load more' button when hasMore is true", () => {
    render(
      <ActivityFeed
        entries={[makeEntry()]}
        loading={false}
        hasMore={true}
        onLoadMore={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /load more/i }),
    ).toBeInTheDocument();
  });

  it("hides 'Load more' button when hasMore is false", () => {
    render(
      <ActivityFeed
        entries={[makeEntry()]}
        loading={false}
        hasMore={false}
        onLoadMore={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /load more/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onLoadMore when 'Load more' is clicked", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <ActivityFeed
        entries={[makeEntry()]}
        loading={false}
        hasMore={true}
        onLoadMore={onLoadMore}
      />,
    );
    await user.click(screen.getByRole("button", { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("shows 'Loading...' text on the button when loading with entries", () => {
    render(
      <ActivityFeed
        entries={[makeEntry()]}
        loading={true}
        hasMore={true}
        onLoadMore={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /loading/i }),
    ).toBeInTheDocument();
  });

  it("disables 'Load more' button when loading", () => {
    render(
      <ActivityFeed
        entries={[makeEntry()]}
        loading={true}
        hasMore={true}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();
  });

  it("does not show loading skeleton when loading with existing entries", () => {
    render(
      <ActivityFeed
        entries={[makeEntry()]}
        loading={true}
        hasMore={true}
        onLoadMore={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("loading-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("Created a new task")).toBeInTheDocument();
  });
});
