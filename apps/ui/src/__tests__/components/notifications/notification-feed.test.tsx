import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationFeed } from "@/components/notifications/notification-feed";
import type { Notification } from "@/lib/notifications/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: vi.fn().mockReturnValue("/dashboard"),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
}));

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "n-1",
    created_at: new Date(Date.now() - 60_000).toISOString(),
    type: "task_assigned",
    title: "New task assigned",
    body: "You've been assigned to review the Q3 report",
    entity_type: "task",
    entity_id: "task-1",
    actor_type: "system",
    actor_agent_id: null,
    is_read: false,
    read_at: null,
    dismissed_at: null,
    meta: {},
    ...overrides,
  };
}

describe("NotificationFeed", () => {
  let onMarkRead: ReturnType<typeof vi.fn>;
  let onMarkAllRead: ReturnType<typeof vi.fn>;
  let onDismiss: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onMarkRead = vi.fn();
    onMarkAllRead = vi.fn();
    onDismiss = vi.fn();
    mockPush.mockClear();
  });

  function renderFeed(
    notifications: Notification[] = [],
    opts: { loading?: boolean; unreadCount?: number } = {}
  ) {
    return render(
      <NotificationFeed
        notifications={notifications}
        loading={opts.loading ?? false}
        unreadCount={opts.unreadCount ?? notifications.filter((n) => !n.is_read).length}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onDismiss={onDismiss}
      />
    );
  }

  it("renders loading skeleton when loading", () => {
    renderFeed([], { loading: true });
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no notifications", () => {
    renderFeed([]);
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });

  it("renders notification title", () => {
    renderFeed([buildNotification()]);
    expect(screen.getByText("New task assigned")).toBeInTheDocument();
  });

  it("renders notification body", () => {
    renderFeed([buildNotification()]);
    expect(screen.getByText("You've been assigned to review the Q3 report")).toBeInTheDocument();
  });

  it("renders unread indicator dot for unread notifications", () => {
    renderFeed([buildNotification({ is_read: false })]);
    const dot = document.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });

  it("does not render unread dot for read notifications", () => {
    renderFeed([buildNotification({ is_read: true, id: "n-read" })]);
    const item = screen.getByText("New task assigned").closest("[role='button']");
    const dot = item?.querySelector("span.rounded-full.bg-primary");
    expect(dot).toBeNull();
  });

  it("renders timestamp", () => {
    renderFeed([buildNotification()]);
    expect(screen.getByText(/minute|second/)).toBeInTheDocument();
  });

  it("renders type label", () => {
    renderFeed([buildNotification({ type: "task_assigned" })]);
    expect(screen.getByText("Task assigned")).toBeInTheDocument();
  });

  it("shows unread count text", () => {
    renderFeed([buildNotification()], { unreadCount: 3 });
    expect(screen.getByText("3 unread")).toBeInTheDocument();
  });

  it("shows All read when no unread", () => {
    renderFeed([buildNotification({ is_read: true })], { unreadCount: 0 });
    expect(screen.getByText("All read")).toBeInTheDocument();
  });

  it("shows Mark all read button when there are unread notifications", () => {
    renderFeed([buildNotification()], { unreadCount: 2 });
    expect(screen.getByText("Mark all read")).toBeInTheDocument();
  });

  it("does not show Mark all read when all are read", () => {
    renderFeed([buildNotification({ is_read: true })], { unreadCount: 0 });
    expect(screen.queryByText("Mark all read")).not.toBeInTheDocument();
  });

  it("calls onMarkAllRead when Mark all read is clicked", async () => {
    const user = userEvent.setup();
    renderFeed([buildNotification()], { unreadCount: 1 });
    await user.click(screen.getByText("Mark all read"));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });

  it("calls onMarkRead and navigates when clicking an unread notification", async () => {
    const user = userEvent.setup();
    renderFeed([buildNotification({ entity_type: "task", entity_id: "task-1" })]);
    await user.click(screen.getByText("New task assigned"));
    expect(onMarkRead).toHaveBeenCalledWith("n-1");
    expect(mockPush).toHaveBeenCalledWith("/dashboard/tasks?task=task-1");
  });

  it("does not call onMarkRead when clicking a read notification", async () => {
    const user = userEvent.setup();
    renderFeed([buildNotification({ is_read: true })]);
    await user.click(screen.getByText("New task assigned"));
    expect(onMarkRead).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalled();
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const user = userEvent.setup();
    renderFeed([buildNotification()]);
    const dismissBtn = screen.getByLabelText("Dismiss notification");
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledWith("n-1");
  });

  it("renders different notification types", () => {
    renderFeed([
      buildNotification({ id: "n-1", type: "follow_up", title: "Follow up needed" }),
      buildNotification({ id: "n-2", type: "agent_suggestion", title: "Agent has a suggestion" }),
    ]);
    expect(screen.getByText("Follow up needed")).toBeInTheDocument();
    expect(screen.getByText("Agent has a suggestion")).toBeInTheDocument();
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
    expect(screen.getByText("Agent suggestion")).toBeInTheDocument();
  });

  it("navigates to contact page for contact entity type", async () => {
    const user = userEvent.setup();
    renderFeed([
      buildNotification({ entity_type: "contact", entity_id: "c-1", is_read: true }),
    ]);
    await user.click(screen.getByText("New task assigned"));
    expect(mockPush).toHaveBeenCalledWith("/dashboard/contacts/c-1");
  });

  it("handles notifications without entity navigation", async () => {
    const user = userEvent.setup();
    renderFeed([
      buildNotification({ entity_type: null, entity_id: null, is_read: true }),
    ]);
    await user.click(screen.getByText("New task assigned"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("supports keyboard navigation", async () => {
    const user = userEvent.setup();
    renderFeed([buildNotification({ entity_type: "task", entity_id: "task-1" })]);
    const item = screen.getByRole("button", { name: /New task assigned/ });
    item.focus();
    await user.keyboard("{Enter}");
    expect(onMarkRead).toHaveBeenCalledWith("n-1");
    expect(mockPush).toHaveBeenCalled();
  });
});
