import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import {
  buildCollectionField,
  buildCollectionRecord,
  buildCollectionView,
} from "@/__tests__/helpers/factories";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
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

import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";

const COLLECTION_ID = "col-1";

function getFromCalls(table: string) {
  const calls = mockSupabase.from.mock.calls;
  const results = mockSupabase.from.mock.results;
  const builders: any[] = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === table) {
      builders.push(results[i].value);
    }
  }
  return builders;
}

function findMutationCall(table: string, method: "insert" | "update" | "delete") {
  const builders = getFromCalls(table);
  for (const b of builders) {
    const fn = b[method];
    if (fn && fn.mock && fn.mock.calls.length > 0) {
      return fn;
    }
  }
  return null;
}

function makeFields() {
  return [
    buildCollectionField({
      id: "cf-title",
      collection_id: COLLECTION_ID,
      field_key: "name",
      label: "Name",
      sort_order: 0,
      is_title_field: true,
      default_value: null,
    }),
    buildCollectionField({
      id: "cf-status",
      collection_id: COLLECTION_ID,
      field_key: "status",
      label: "Status",
      sort_order: 1,
      is_title_field: false,
      default_value: "open",
    }),
  ];
}

function makeRecords() {
  return [
    buildCollectionRecord({
      id: "cr-1",
      collection_id: COLLECTION_ID,
      values: { name: "Alpha", status: "open" },
      archived_at: null,
    }),
    buildCollectionRecord({
      id: "cr-2",
      collection_id: COLLECTION_ID,
      values: { name: "Beta", status: "closed" },
      archived_at: null,
    }),
  ];
}

function makeViews() {
  return [
    buildCollectionView({
      id: "cv-1",
      collection_id: COLLECTION_ID,
      name: "All Records",
      view_type: "table",
      is_default: true,
      sort_order: 0,
    }),
    buildCollectionView({
      id: "cv-2",
      collection_id: COLLECTION_ID,
      name: "Board",
      view_type: "kanban",
      is_default: false,
      sort_order: 1,
    }),
  ];
}

function setupMock(overrides?: {
  records?: ReturnType<typeof buildCollectionRecord>[];
  fields?: ReturnType<typeof buildCollectionField>[];
  views?: ReturnType<typeof buildCollectionView>[];
  recordInsert?: { data: unknown; error: null } | { data: null; error: { message: string } };
  updateResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
  deleteResponse?: { data: unknown; error: null } | { data: null; error: { message: string } };
}) {
  const records = overrides?.records ?? makeRecords();
  const fields = overrides?.fields ?? makeFields();
  const views = overrides?.views ?? makeViews();
  const recordInsert = overrides?.recordInsert ?? {
    data: [{
      id: "cr-new",
      collection_id: COLLECTION_ID,
      values: {},
      sort_order: 0,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }],
    error: null,
  };
  const updateResp = overrides?.updateResponse ?? { data: [], error: null };
  const deleteResp = overrides?.deleteResponse ?? { data: [], error: null };

  mockSupabase = createMockSupabaseClient({
    tables: new Map([
      [
        "collection_records",
        {
          select: { data: records, error: null },
          insert: recordInsert,
          update: updateResp,
          delete: deleteResp,
        },
      ],
      [
        "collection_fields",
        {
          select: { data: fields, error: null },
          insert: { data: fields, error: null },
          update: updateResp,
          delete: deleteResp,
        },
      ],
      [
        "collection_views",
        {
          select: { data: views, error: null },
          insert: { data: [views[0]], error: null },
          update: updateResp,
          delete: deleteResp,
        },
      ],
    ]),
  });
}

async function renderCollectionRecords() {
  const { useCollectionRecords } = await import(
    "@/hooks/use-collection-records"
  );
  return renderHook(() => useCollectionRecords(COLLECTION_ID));
}

describe("useCollectionRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches records, fields, and views on mount", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.allRecords).toHaveLength(2);
    expect(result.current.fields).toHaveLength(2);
    expect(result.current.views).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("collection_records");
    expect(mockSupabase.from).toHaveBeenCalledWith("collection_fields");
    expect(mockSupabase.from).toHaveBeenCalledWith("collection_views");
  });

  it("returns loading state initially", async () => {
    setupMock();
    const { useCollectionRecords } = await import(
      "@/hooks/use-collection-records"
    );
    const { result } = renderHook(() => useCollectionRecords(COLLECTION_ID));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("createRecord inserts with default values from fields and calls logAudit", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createRecord({ name: "New Record" });
    });

    const insertFn = findMutationCall("collection_records", "insert");
    expect(insertFn).not.toBeNull();

    const insertedPayload = insertFn.mock.calls[0][0];
    expect(insertedPayload.collection_id).toBe(COLLECTION_ID);
    expect(insertedPayload.values.name).toBe("New Record");
    expect(insertedPayload.values.status).toBe("open");

    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        module: "collections",
        entity_type: "collection_record",
        action: "created",
      }),
    );
  });

  it("updateRecord updates record values", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateRecord("cr-1", {
        name: "Updated Alpha",
      });
    });

    const updateFn = findMutationCall("collection_records", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn.mock.calls[0][0]).toEqual({
      values: { name: "Updated Alpha" },
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "updated" }),
    );
  });

  it("updateCell does optimistic update then supabase update", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateCell("cr-1", "status", "done");
    });

    const updateFn = findMutationCall("collection_records", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn.mock.calls[0][0]).toEqual({
      values: { name: "Alpha", status: "done" },
    });
  });

  it("archiveRecord sets archived_at and calls logAudit", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.archiveRecord("cr-1");
    });

    const updateFn = findMutationCall("collection_records", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn.mock.calls[0][0]).toHaveProperty("archived_at");
    expect(typeof updateFn.mock.calls[0][0].archived_at).toBe("string");
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "archived" }),
    );
  });

  it("restoreRecord clears archived_at and shows toast", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.restoreRecord("cr-1");
    });

    const updateFn = findMutationCall("collection_records", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn.mock.calls[0][0]).toEqual({ archived_at: null });
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "restored" }),
    );
    expect(toast.success).toHaveBeenCalledWith("Record restored");
  });

  it("deleteRecord deletes and calls logAudit", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteRecord("cr-1");
    });

    const deleteFn = findMutationCall("collection_records", "delete");
    expect(deleteFn).not.toBeNull();
    expect(logAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "deleted" }),
    );
  });

  it("addField inserts new field with correct sort_order", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.addField({
        field_key: "priority",
        field_type: "select",
        label: "Priority",
      });
    });

    const insertFn = findMutationCall("collection_fields", "insert");
    expect(insertFn).not.toBeNull();
    expect(insertFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        collection_id: COLLECTION_ID,
        field_key: "priority",
        field_type: "select",
        label: "Priority",
        sort_order: 2,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Added field "Priority"');
  });

  it("updateField updates field properties", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateField("cf-title", {
        label: "Full Name",
      });
    });

    const updateFn = findMutationCall("collection_fields", "update");
    expect(updateFn).not.toBeNull();
    expect(updateFn.mock.calls[0][0]).toEqual({ label: "Full Name" });
  });

  it("deleteField deletes field and cleans up record values", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteField("cf-status");
    });

    const deleteFn = findMutationCall("collection_fields", "delete");
    expect(deleteFn).not.toBeNull();

    const recordUpdateFn = findMutationCall("collection_records", "update");
    expect(recordUpdateFn).not.toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Field deleted");
  });

  it("reorderFields updates sort_order for each field", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.reorderFields(["cf-status", "cf-title"]);
    });

    const builders = getFromCalls("collection_fields");
    const updateCalls: unknown[] = [];
    for (const b of builders) {
      if (b.update?.mock?.calls?.length) {
        for (const c of b.update.mock.calls) {
          updateCalls.push(c[0]);
        }
      }
    }
    expect(updateCalls).toContainEqual({ sort_order: 0 });
    expect(updateCalls).toContainEqual({ sort_order: 1 });
  });

  it("createView inserts new view", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.createView({
        name: "Calendar",
        view_type: "calendar",
      });
    });

    const insertFn = findMutationCall("collection_views", "insert");
    expect(insertFn).not.toBeNull();
    expect(insertFn.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        collection_id: COLLECTION_ID,
        name: "Calendar",
        view_type: "calendar",
        is_default: false,
        sort_order: 2,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('View "Calendar" created');
  });

  it("updateView updates view including making it default", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.updateView("cv-2", { is_default: true });
    });

    const builders = getFromCalls("collection_views");
    const updateCalls: unknown[] = [];
    for (const b of builders) {
      if (b.update?.mock?.calls?.length) {
        for (const c of b.update.mock.calls) {
          updateCalls.push(c[0]);
        }
      }
    }
    expect(updateCalls).toContainEqual({ is_default: false });
    expect(updateCalls).toContainEqual({ is_default: true });
  });

  it("deleteView prevents deleting the last view", async () => {
    setupMock({
      views: [
        buildCollectionView({
          id: "cv-only",
          collection_id: COLLECTION_ID,
          is_default: true,
        }),
      ],
    });
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.actions.deleteView("cv-only");
    });

    expect(toast.error).toHaveBeenCalledWith("Cannot delete the last view");
  });

  it("importRecords batch-inserts records", async () => {
    setupMock({
      recordInsert: {
        data: [{ id: "cr-import-1" }, { id: "cr-import-2" }],
        error: null,
      },
    });
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let count = 0;
    await act(async () => {
      count = await result.current.actions.importRecords([
        { name: "Imported 1" },
        { name: "Imported 2" },
      ]);
    });

    expect(count).toBe(2);
    const insertFn = findMutationCall("collection_records", "insert");
    expect(insertFn).not.toBeNull();
    expect(insertFn.mock.calls[0][0]).toEqual([
      { collection_id: COLLECTION_ID, values: { name: "Imported 1" } },
      { collection_id: COLLECTION_ID, values: { name: "Imported 2" } },
    ]);
    expect(toast.success).toHaveBeenCalledWith("Imported 2 records");
  });

  it("filters.search filters records client-side", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.records).toHaveLength(2);

    act(() => {
      result.current.filters.setSearch("alpha");
    });

    expect(result.current.records).toHaveLength(1);
    expect(result.current.records[0].values.name).toBe("Alpha");
  });

  it("filters.setShowArchived toggles archived records visibility", async () => {
    setupMock();
    const { result } = await renderCollectionRecords();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.filters.showArchived).toBe(false);

    act(() => {
      result.current.filters.setShowArchived(true);
    });

    expect(result.current.filters.showArchived).toBe(true);
  });
});
