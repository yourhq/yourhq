import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/hooks/use-realtime-sync", () => ({
  useRealtimeSync: vi.fn(),
}));

function buildFieldDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: "fd-1",
    created_at: new Date().toISOString(),
    entity_type: "contact",
    field_key: "company",
    field_type: "text",
    label: "Company",
    field_group: null as string | null,
    sort_order: 0,
    required: false,
    options: null as string[] | null,
    description: null as string | null,
    is_active: true,
    ...overrides,
  };
}

describe("useFieldDefinitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches field definitions on mount", async () => {
    const field1 = buildFieldDefinition({ id: "fd-1", label: "Company", sort_order: 0 });
    const field2 = buildFieldDefinition({ id: "fd-2", field_key: "role", label: "Role", sort_order: 1 });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", { select: { data: [field1, field2], error: null } }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fields).toHaveLength(2);
    expect(mockSupabase.from).toHaveBeenCalledWith("field_definitions");
  });

  it("returns loading state initially", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", { select: { data: [], error: null } }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("addField inserts a field definition", async () => {
    const newField = buildFieldDefinition({ id: "fd-new", field_key: "phone", label: "Phone" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", {
          select: { data: [], error: null },
          insert: { data: [newField], error: null },
        }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let added: unknown;
    await act(async () => {
      added = await result.current.addField({
        label: "Phone",
        field_type: "text" as never,
      });
    });

    expect(added).toBeTruthy();
    expect(mockSupabase.from).toHaveBeenCalledWith("field_definitions");
  });

  it("addField shows error toast on duplicate", async () => {
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", {
          select: { data: [], error: null },
          insert: { data: null, error: { message: "duplicate key value" } },
        }],
      ]),
    });

    const { toast } = await import("sonner");
    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let added: unknown;
    await act(async () => {
      added = await result.current.addField({
        label: "Company",
        field_type: "text" as never,
      });
    });

    expect(added).toBeNull();
    expect(toast.error).toHaveBeenCalledWith("A field with that name already exists");
  });

  it("updateField updates a field definition", async () => {
    const field = buildFieldDefinition({ id: "fd-upd" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", {
          select: { data: [field], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean;
    await act(async () => {
      ok = await result.current.updateField("fd-upd", { label: "Updated Label" });
    });

    expect(ok!).toBe(true);
  });

  it("deleteField removes a field definition", async () => {
    const field = buildFieldDefinition({ id: "fd-del" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", {
          select: { data: [field], error: null },
          delete: { data: null, error: null },
        }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok: boolean;
    await act(async () => {
      ok = await result.current.deleteField("fd-del");
    });

    expect(ok!).toBe(true);
    expect(result.current.fields).toHaveLength(0);
  });

  it("reorderFields updates sort_order for each field", async () => {
    const field1 = buildFieldDefinition({ id: "fd-a", sort_order: 0 });
    const field2 = buildFieldDefinition({ id: "fd-b", sort_order: 1 });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", {
          select: { data: [field1, field2], error: null },
          update: { data: null, error: null },
        }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reorderFields(["fd-b", "fd-a"]);
    });

    expect(result.current.fields[0].id).toBe("fd-b");
    expect(result.current.fields[0].sort_order).toBe(0);
    expect(result.current.fields[1].id).toBe("fd-a");
    expect(result.current.fields[1].sort_order).toBe(1);
  });

  it("fieldsByKey provides lookup by field_key", async () => {
    const field = buildFieldDefinition({ id: "fd-key", field_key: "email", label: "Email" });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", { select: { data: [field], error: null } }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.fieldsByKey["email"]).toEqual(expect.objectContaining({ id: "fd-key", label: "Email" }));
  });

  it("groupedFields groups by field_group", async () => {
    const f1 = buildFieldDefinition({ id: "fd-g1", field_group: "Personal", sort_order: 0 });
    const f2 = buildFieldDefinition({ id: "fd-g2", field_group: "Personal", sort_order: 1 });
    const f3 = buildFieldDefinition({ id: "fd-g3", field_group: "Work", sort_order: 0 });

    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["field_definitions", { select: { data: [f1, f2, f3], error: null } }],
      ]),
    });

    const { useFieldDefinitions } = await import("@/hooks/use-field-definitions");
    const { result } = renderHook(() => useFieldDefinitions("contact"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const groups = result.current.groupedFields;
    expect(groups).toHaveLength(2);
    const personalGroup = groups.find((g) => g.group === "Personal");
    expect(personalGroup?.fields).toHaveLength(2);
  });
});
