import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import { buildOrganization } from "@/__tests__/helpers/factories";

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

const org1 = buildOrganization({ id: "org-1", name: "Acme Corp", industry: "Tech", tags: ["enterprise"] });
const org2 = buildOrganization({ id: "org-2", name: "Globex Inc", industry: "Finance", tags: [] });

function setupMock(tableOverrides?: Record<string, Record<string, unknown>>) {
  const tables = new Map<string, Record<string, unknown>>([
    ["organizations", { select: { data: [org1, org2], error: null }, update: { data: [], error: null }, delete: { data: [], error: null } }],
  ]);
  if (tableOverrides) {
    for (const [k, v] of Object.entries(tableOverrides)) {
      const existing = tables.get(k) ?? {};
      tables.set(k, { ...existing, ...v });
    }
  }
  mockSupabase = createMockSupabaseClient({ tables });
}

describe("useOrganizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMock();
  });

  it("fetches organizations on mount", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.organizations).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("organizations");
  });

  it("returns loading state", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("handleArchiveOrg archives and calls logAudit", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleArchiveOrg("org-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "archived", entity_type: "organization" }),
    );
  });

  it("handleRestoreOrg restores and calls logAudit", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleRestoreOrg("org-1");
    });

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "restored" }),
    );
  });

  it("handleDeleteOrg deletes and calls logAudit", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.handleDeleteOrg("org-1");
    });

    expect(mockSupabase.from).toHaveBeenCalledWith("organizations");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted" }),
    );
  });

  it("filter: globalFilter applies text search", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setGlobalFilter("acme");
    });

    expect(result.current.organizations).toHaveLength(1);
    expect(result.current.organizations[0].name).toBe("Acme Corp");
  });

  it("filter: typeFilter updates state", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setTypeFilter("partner");
    });

    expect(result.current.filters.typeFilter).toBe("partner");
  });

  it("filter: showArchived updates state", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setShowArchived(true);
    });

    expect(result.current.filters.showArchived).toBe(true);
  });

  it("clearFilters resets all", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.filters.setTypeFilter("partner");
      result.current.filters.setShowArchived(true);
      result.current.filters.setGlobalFilter("test");
    });

    act(() => {
      result.current.filters.clearFilters();
    });

    expect(result.current.filters.typeFilter).toBe("all");
    expect(result.current.filters.showArchived).toBe(false);
    expect(result.current.filters.globalFilter).toBe("");
  });

  it("form.openCreateForm/closeForm toggle showForm", async () => {
    const { useOrganizations } = await import("@/hooks/use-organizations");
    const { result } = renderHook(() => useOrganizations());
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
});
