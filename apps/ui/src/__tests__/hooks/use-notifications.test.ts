import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("@/hooks/use-realtime-sync", () => ({
  useRealtimeSync: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

let counter = 0;

function buildNotification(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `notif-${counter}`,
    created_at: new Date().toISOString(),
    type: "task_assigned",
    title: `Test notification ${counter}`,
    body: "Something happened",
    entity_type: "task",
    entity_id: "task-1",
    actor_type: "human",
    actor_agent_id: null,
    read_at: null as string | null,
    dismissed_at: null as string | null,
    meta: {},
    ...overrides,
  };
}

beforeEach(() => {
  counter = 0;
  vi.clearAllMocks();
  vi.resetModules();
});

describe("useNotifications", () => {
  it("fetches notifications on mount and sets loading to false", async () => {
    const n1 = buildNotification({ title: "First" });
    const n2 = buildNotification({ title: "Second" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", { select: { data: [n1, n2], error: null } }],
      ]),
    });

    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notifications).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("notifications");
  });

  it("loading state is true initially", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", { select: { data: [], error: null } }],
      ]),
    });

    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("returns correct unreadCount with a mix of read and unread", async () => {
    const unread1 = buildNotification({ read_at: null });
    const unread2 = buildNotification({ read_at: null });
    const read1 = buildNotification({ read_at: "2025-01-01T00:00:00Z" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", { select: { data: [unread1, unread2, read1], error: null } }],
      ]),
    });

    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unreadCount).toBe(2);
    expect(result.current.notifications).toHaveLength(3);
  });

  it("markAsRead optimistically updates the notification", async () => {
    const n1 = buildNotification({ id: "notif-mark", read_at: null });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", {
          select: { data: [n1], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(1);

    await act(async () => {
      await result.current.markAsRead("notif-mark");
    });

    expect(result.current.notifications[0].read_at).not.toBeNull();
    expect(result.current.unreadCount).toBe(0);
  });

  it("markAllRead optimistically marks all as read", async () => {
    const n1 = buildNotification({ id: "notif-a", read_at: null });
    const n2 = buildNotification({ id: "notif-b", read_at: null });
    const n3 = buildNotification({ id: "notif-c", read_at: "2025-01-01T00:00:00Z" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", {
          select: { data: [n1, n2, n3], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications.every((n) => n.read_at !== null)).toBe(true);
  });

  it("dismiss optimistically removes from list", async () => {
    const n1 = buildNotification({ id: "notif-keep" });
    const n2 = buildNotification({ id: "notif-dismiss" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", {
          select: { data: [n1, n2], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toHaveLength(2);

    await act(async () => {
      await result.current.dismiss("notif-dismiss");
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe("notif-keep");
  });

  it("markAsRead rolls back on error", async () => {
    const n1 = buildNotification({ id: "notif-fail", read_at: null });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", {
          select: { data: [n1], error: null },
          update: { data: null, error: { message: "Update failed" } },
        }],
      ]),
    });

    const { toast } = await import("sonner");
    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.unreadCount).toBe(1);

    await act(async () => {
      await result.current.markAsRead("notif-fail");
    });

    expect(result.current.notifications[0].read_at).toBeNull();
    expect(result.current.unreadCount).toBe(1);
    expect(toast.error).toHaveBeenCalledWith("Failed to mark notification as read");
  });

  it("dismiss rolls back on error and shows toast", async () => {
    const n1 = buildNotification({ id: "notif-undismiss" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", {
          select: { data: [n1], error: null },
          update: { data: null, error: { message: "Dismiss failed" } },
        }],
      ]),
    });

    const { toast } = await import("sonner");
    const { useNotifications } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);

    await act(async () => {
      await result.current.dismiss("notif-undismiss");
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].id).toBe("notif-undismiss");
    expect(toast.error).toHaveBeenCalledWith("Failed to dismiss notification");
  });
});

describe("useUnreadNotificationCount", () => {
  it("returns count and supports refresh", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["notifications", { select: { data: null, error: null, count: 5 } as never }],
      ]),
    });

    const { useUnreadNotificationCount } = await import("@/hooks/use-notifications");
    const { result } = renderHook(() => useUnreadNotificationCount());

    await waitFor(() => expect(result.current.count).toBe(5));

    expect(typeof result.current.refresh).toBe("function");
  });
});
