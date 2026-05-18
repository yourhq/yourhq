import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildContact } from "@/__tests__/helpers/factories";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/onboarding/progress", () => ({ completeItem: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-realtime-sync", () => ({ useRealtimeSync: vi.fn() }));
vi.mock("@/hooks/use-realtime", () => ({ useRealtime: vi.fn() }));

import { logAudit } from "@/lib/audit/log";

const contact1 = buildContact({ id: "c-1", name: "Alice Smith", email: "alice@co.com", company: "Acme", tags: ["vip"] });
const contact2 = buildContact({ id: "c-2", name: "Bob Jones", email: "bob@co.com", company: "Globex", tags: [] });

function setupMock(tableOverrides?: Record<string, Record<string, unknown>>) {
  const tables = new Map<string, Record<string, unknown>>([
    ["contacts", { select: { data: [contact1, contact2], error: null }, update: { data: [], error: null }, delete: { data: [], error: null } }],
    ["campaigns", { select: { data: [], error: null } }],
    ["interactions", { select: { data: [], error: null } }],
  ]);
  if (tableOverrides) {
    for (const [k, v] of Object.entries(tableOverrides)) {
      const existing = tables.get(k) ?? {};
      tables.set(k, { ...existing, ...v });
    }
  }
  mockSupabase = createMockSupabaseClient({ tables });
}

describe("useContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock();
  });

  it("fetches contacts on mount", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contacts).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("contacts");
  });

  it("returns loading state", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("handleArchiveContact archives and logs audit", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleArchiveContact("c-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "archived", entity_type: "contact" }),
    );
  });

  it("handleRestoreContact restores", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleRestoreContact("c-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "restored" }),
    );
  });

  it("handleDeleteContact deletes", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleDeleteContact("c-1");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("contacts");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted" }),
    );
  });

  it("handleStatusChange updates status", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleStatusChange("c-1", "inactive");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "status_changed" }),
    );
  });

  it("handleBulkArchive archives multiple", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleBulkArchive(["c-1", "c-2"]);
    });

    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it("handleBulkDelete deletes multiple", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleBulkDelete(["c-1", "c-2"]);
    });

    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it("handleBulkStatusChange updates multiple statuses", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleBulkStatusChange(["c-1", "c-2"], "inactive");
    });

    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it("filters: globalFilter updates state", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setGlobalFilter("alice");
    });

    expect(result.current.filters.globalFilter).toBe("alice");
  });

  it("filters: statusFilter, priorityFilter, followUpFilter, showArchived update state", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setStatusFilter("inactive");
    });
    expect(result.current.filters.statusFilter).toBe("inactive");

    act(() => {
      result.current.filters.setPriorityFilter("high");
    });
    expect(result.current.filters.priorityFilter).toBe("high");

    act(() => {
      result.current.filters.setFollowUpFilter(true);
    });
    expect(result.current.filters.followUpFilter).toBe(true);

    act(() => {
      result.current.filters.setShowArchived(true);
    });
    expect(result.current.filters.showArchived).toBe(true);
  });

  it("form.openCreateForm/closeForm toggle", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.form.showForm).toBe(false);

    act(() => {
      result.current.form.openCreateForm();
    });
    expect(result.current.form.showForm).toBe(true);

    act(() => {
      result.current.form.closeForm();
    });
    expect(result.current.form.showForm).toBe(false);
  });

  it("filteredContacts applies text search", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setGlobalFilter("alice");
    });

    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe("Alice Smith");
  });

  it("clearFilters resets all", async () => {
    const { useContacts } = await import("@/hooks/use-contacts");
    const { result } = renderHook(() => useContacts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setStatusFilter("inactive");
      result.current.filters.setPriorityFilter("high");
      result.current.filters.setShowArchived(true);
      result.current.filters.setGlobalFilter("test");
    });

    act(() => {
      result.current.filters.clearFilters();
    });

    expect(result.current.filters.statusFilter).toBe("all");
    expect(result.current.filters.priorityFilter).toBe("all");
    expect(result.current.filters.showArchived).toBe(false);
    expect(result.current.filters.globalFilter).toBe("");
  });
});
