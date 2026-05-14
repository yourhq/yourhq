import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InboxSection } from "@/components/inbox/inbox-section";
import type { InboxItem } from "@/lib/inbox/types";

function buildInboxItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "inbox-1",
    created_at: new Date(Date.now() - 120_000).toISOString(),
    updated_at: new Date().toISOString(),
    agent_id: "agent-1",
    agent_slug: "sales-bot",
    event_type: "task_assignment",
    task_id: "task-1",
    comment_id: null,
    contact_id: null,
    status: "pending",
    leased_at: null,
    leased_until: null,
    completed_at: null,
    failed_at: null,
    attempt_count: 0,
    max_attempts: 3,
    summary: "Assigned to task: Review Q3 Report",
    context: { task_title: "Review Q3 Report" },
    last_wake_attempt_at: null,
    last_wake_success_at: null,
    dedup_key: "task_assignment:task-1",
    agent: { id: "agent-1", name: "Sales Bot", slug: "sales-bot" },
    contact: null,
    ...overrides,
  };
}

const mockLoadMore = vi.fn();
const mockSetStatusFilter = vi.fn();

let mockItems: InboxItem[] = [];
let mockLoading = false;
let mockHasMore = false;
let mockStatusFilter: string = "all";
let mockCounts = { pending: 0, leased: 0, done: 0, failed: 0, dead_letter: 0 };

vi.mock("@/hooks/use-inbox-items", () => ({
  useInboxItems: () => ({
    items: mockItems,
    loading: mockLoading,
    hasMore: mockHasMore,
    loadMore: mockLoadMore,
    statusFilter: mockStatusFilter,
    setStatusFilter: mockSetStatusFilter,
    counts: mockCounts,
  }),
}));

describe("InboxSection", () => {
  beforeEach(() => {
    mockItems = [];
    mockLoading = false;
    mockHasMore = false;
    mockStatusFilter = "all";
    mockCounts = { pending: 0, leased: 0, done: 0, failed: 0, dead_letter: 0 };
    vi.clearAllMocks();
  });

  it("renders Inbox heading", () => {
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
  });

  it("renders empty state when no items", () => {
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("No inbox items")).toBeInTheDocument();
  });

  it("renders status filter tabs", () => {
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Dead Letter")).toBeInTheDocument();
  });

  it("calls setStatusFilter when a tab is clicked", async () => {
    const user = userEvent.setup();
    render(<InboxSection agentId="agent-1" />);
    await user.click(screen.getByText("Pending"));
    expect(mockSetStatusFilter).toHaveBeenCalledWith("pending");
  });

  it("shows pending count badge when there are pending items", () => {
    mockCounts = { pending: 3, leased: 0, done: 0, failed: 0, dead_letter: 0 };
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("3 pending")).toBeInTheDocument();
  });

  it("does not show pending badge when count is zero", () => {
    render(<InboxSection agentId="agent-1" />);
    expect(screen.queryByText(/pending$/)).not.toBeInTheDocument();
  });

  it("renders inbox items with event type", () => {
    mockItems = [buildInboxItem()];
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("task assignment")).toBeInTheDocument();
  });

  it("renders inbox item summary", () => {
    mockItems = [buildInboxItem({ summary: "Assigned to task: Review Q3 Report" })];
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("Assigned to task: Review Q3 Report")).toBeInTheDocument();
  });

  it("shows No summary for items without summary", () => {
    mockItems = [buildInboxItem({ summary: null })];
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("No summary")).toBeInTheDocument();
  });

  it("renders timestamp", () => {
    mockItems = [buildInboxItem()];
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText(/minute|second/)).toBeInTheDocument();
  });

  it("shows attempt count when greater than 0", () => {
    mockItems = [buildInboxItem({ attempt_count: 2 })];
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("2x")).toBeInTheDocument();
  });

  it("expands context on click", async () => {
    const user = userEvent.setup();
    mockItems = [buildInboxItem({ context: { task_title: "Important Task" } })];
    render(<InboxSection agentId="agent-1" />);
    const itemButton = screen.getByText("Assigned to task: Review Q3 Report").closest("button")!;
    await user.click(itemButton);
    expect(screen.getByText(/"task_title"/)).toBeInTheDocument();
  });

  it("renders Load more button when hasMore is true", () => {
    mockItems = [buildInboxItem()];
    mockHasMore = true;
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("Load more")).toBeInTheDocument();
  });

  it("calls loadMore when Load more is clicked", async () => {
    const user = userEvent.setup();
    mockItems = [buildInboxItem()];
    mockHasMore = true;
    render(<InboxSection agentId="agent-1" />);
    await user.click(screen.getByText("Load more"));
    expect(mockLoadMore).toHaveBeenCalledOnce();
  });

  it("does not show Load more when hasMore is false", () => {
    mockItems = [buildInboxItem()];
    mockHasMore = false;
    render(<InboxSection agentId="agent-1" />);
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();
  });

  it("renders multiple items", () => {
    mockItems = [
      buildInboxItem({ id: "i-1", event_type: "task_assignment", summary: "Task A" }),
      buildInboxItem({ id: "i-2", event_type: "routine_schedule", summary: "Routine B" }),
    ];
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Routine B")).toBeInTheDocument();
  });

  it("renders different event types correctly", () => {
    mockItems = [
      buildInboxItem({ id: "i-1", event_type: "contact_created" }),
      buildInboxItem({ id: "i-2", event_type: "routine_event" }),
    ];
    render(<InboxSection agentId="agent-1" />);
    expect(screen.getByText("contact created")).toBeInTheDocument();
    expect(screen.getByText("routine event")).toBeInTheDocument();
  });
});
