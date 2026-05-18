import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import { buildCollectionDefinition } from "../helpers/factories";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/onboarding/progress", () => ({
  completeItem: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit/log";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { useCollections } from "@/hooks/use-collections";
import type { CollectionTemplate } from "@/lib/collections/types";

let supabase: ReturnType<typeof createMockSupabaseClient>;

function makeCollections() {
  return [
    buildCollectionDefinition({ id: "col-1", name: "Contacts", slug: "contacts", description: "All contacts", archived_at: null }),
    buildCollectionDefinition({ id: "col-2", name: "Projects", slug: "projects", description: "Active projects", archived_at: null }),
  ];
}

function makeTemplates() {
  return [{
    id: "tpl-1",
    created_at: new Date().toISOString(),
    name: "CRM",
    slug: "crm",
    description: "CRM template",
    icon: null,
    category: null,
    sort_order: 0,
    definition: {
      fields: [{ field_key: "name", field_type: "text", label: "Name", sort_order: 0, required: false, is_title_field: true, options: null, default_value: null }],
      views: [{ name: "All", view_type: "table", is_default: true, config: {} }],
    },
  }];
}

function setup(overrides?: { collections?: unknown[]; templates?: unknown[] }) {
  supabase = createMockSupabaseClient({
    tables: new Map([
      ["collection_definitions", {
        select: { data: overrides?.collections ?? makeCollections(), error: null },
        insert: { data: [buildCollectionDefinition({ id: "col-new", name: "New", slug: "new" })], error: null },
        update: { data: [], error: null },
        delete: { data: [], error: null },
      }],
      ["collection_fields", { select: { data: [], error: null }, insert: { data: [], error: null } }],
      ["collection_views", { select: { data: [], error: null }, insert: { data: [], error: null } }],
      ["collection_templates", { select: { data: overrides?.templates ?? makeTemplates(), error: null } }],
    ]),
  });
  vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>);
}

describe("useCollections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches collections and templates on mount", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allCollections).toHaveLength(2);
    expect(result.current.templates).toHaveLength(1);
    expect(supabase.from).toHaveBeenCalledWith("collection_definitions");
    expect(supabase.from).toHaveBeenCalledWith("collection_templates");
  });

  it("returns loading state initially", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("createCollection inserts definition, seeds field and view", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createCollection({ name: "Tasks", slug: "tasks", description: "Tracker" });
    });

    expect(supabase.from).toHaveBeenCalledWith("collection_definitions");
    expect(supabase.from).toHaveBeenCalledWith("collection_fields");
    expect(supabase.from).toHaveBeenCalledWith("collection_views");
    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "created" }));
    expect(trackEvent).toHaveBeenCalledWith("collection_created");
    expect(toast.success).toHaveBeenCalledWith("Collection created");
  });

  it("updateCollection updates definition", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateCollection("col-1", { name: "Renamed" });
    });

    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "updated" }));
    expect(toast.success).toHaveBeenCalledWith("Collection updated");
  });

  it("archiveCollection sets archived_at", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.archiveCollection("col-1");
    });

    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "archived" }));
    expect(toast.success).toHaveBeenCalledWith("Collection archived");
  });

  it("restoreCollection clears archived_at", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.restoreCollection("col-1");
    });

    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "restored" }));
    expect(toast.success).toHaveBeenCalledWith("Collection restored");
  });

  it("deleteCollection deletes definition", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteCollection("col-1");
    });

    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "deleted" }));
    expect(toast.success).toHaveBeenCalledWith("Collection deleted");
  });

  it("installTemplate creates collection from template", async () => {
    setup({ collections: [] });
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.installTemplate(makeTemplates()[0] as unknown as CollectionTemplate);
    });

    expect(logAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "created",
      summary: expect.stringContaining("template"),
    }));
    expect(toast.success).toHaveBeenCalledWith('Installed "CRM"');
  });

  it("filters.search filters collections client-side", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.collections).toHaveLength(2);

    act(() => { result.current.filters.setSearch("contacts"); });
    expect(result.current.collections).toHaveLength(1);
    expect(result.current.collections[0].name).toBe("Contacts");
  });

  it("filters.setShowArchived toggles state", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filters.showArchived).toBe(false);

    act(() => { result.current.filters.setShowArchived(true); });
    expect(result.current.filters.showArchived).toBe(true);
  });

  it("form.openCreate/closeCreate toggles showCreate", async () => {
    setup();
    const { result } = renderHook(() => useCollections());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.form.showCreate).toBe(false);

    act(() => { result.current.form.openCreate(); });
    expect(result.current.form.showCreate).toBe(true);

    act(() => { result.current.form.closeCreate(); });
    expect(result.current.form.showCreate).toBe(false);
  });
});
