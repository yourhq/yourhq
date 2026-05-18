import { describe, it, expect, vi } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import {
  useCollectionFilters,
  CollectionFilterBar,
} from "@/components/collections/collection-filter-bar";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";

function buildField(overrides: Partial<CollectionField> = {}): CollectionField {
  return {
    id: "f-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    field_key: "name",
    field_type: "text",
    label: "Name",
    description: null,
    sort_order: 0,
    required: false,
    options: null,
    default_value: null,
    is_title_field: false,
    is_active: true,
    ...overrides,
  };
}

function buildRecord(
  id: string,
  values: Record<string, unknown>,
): CollectionRecord {
  return {
    id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    values,
    sort_order: 0,
    archived_at: null,
  };
}

describe("useCollectionFilters", () => {
  it("starts with empty conditions", () => {
    const { result } = renderHook(() => useCollectionFilters());
    expect(result.current.conditions).toEqual([]);
  });

  it("addCondition adds a condition with correct shape", () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("status", "equals");
    });

    expect(result.current.conditions).toHaveLength(1);
    const cond = result.current.conditions[0];
    expect(cond).toMatchObject({
      fieldKey: "status",
      operator: "equals",
      value: "",
    });
    expect(cond.id).toBeTruthy();
  });

  it("updateCondition modifies a condition's value", () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("name", "contains");
    });
    const id = result.current.conditions[0].id;

    act(() => {
      result.current.updateCondition(id, { value: "alice" });
    });

    expect(result.current.conditions[0].value).toBe("alice");
    expect(result.current.conditions[0].operator).toBe("contains");
  });

  it("removeCondition removes by id", () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("name", "contains");
      result.current.addCondition("email", "equals");
    });
    expect(result.current.conditions).toHaveLength(2);

    const idToRemove = result.current.conditions[0].id;
    act(() => {
      result.current.removeCondition(idToRemove);
    });

    expect(result.current.conditions).toHaveLength(1);
    expect(result.current.conditions[0].fieldKey).toBe("email");
  });

  it("clearAll empties all conditions", () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("a", "contains");
      result.current.addCondition("b", "equals");
      result.current.addCondition("c", "is empty");
    });
    expect(result.current.conditions).toHaveLength(3);

    act(() => {
      result.current.clearAll();
    });
    expect(result.current.conditions).toEqual([]);
  });

  it("applyFilters with no conditions returns all records", () => {
    const { result } = renderHook(() => useCollectionFilters());

    const fields = [buildField({ field_key: "name", field_type: "text" })];
    const records = [
      buildRecord("1", { name: "Alice" }),
      buildRecord("2", { name: "Bob" }),
    ];

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toEqual(records);
  });

  it('applyFilters "contains" filters text case-insensitively', () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("name", "contains");
    });
    const id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "ali" });
    });

    const fields = [buildField({ field_key: "name", field_type: "text" })];
    const records = [
      buildRecord("1", { name: "Alice" }),
      buildRecord("2", { name: "Bob" }),
      buildRecord("3", { name: "ALICE WONDERLAND" }),
    ];

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it('applyFilters "equals" matches exactly case-insensitively', () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("name", "equals");
    });
    const id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "alice" });
    });

    const fields = [buildField({ field_key: "name", field_type: "text" })];
    const records = [
      buildRecord("1", { name: "Alice" }),
      buildRecord("2", { name: "alice" }),
      buildRecord("3", { name: "Alice Smith" }),
    ];

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it('applyFilters "is empty" matches null, undefined, and empty string', () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("notes", "is empty");
    });

    const fields = [buildField({ field_key: "notes", field_type: "text" })];
    const records = [
      buildRecord("1", { notes: null }),
      buildRecord("2", { notes: "hello" }),
      buildRecord("3", { notes: "" }),
      buildRecord("4", {}), // undefined
    ];

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((r) => r.id)).toEqual(["1", "3", "4"]);
  });

  it('applyFilters "is not empty" excludes empty values', () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("notes", "is not empty");
    });

    const fields = [buildField({ field_key: "notes", field_type: "text" })];
    const records = [
      buildRecord("1", { notes: null }),
      buildRecord("2", { notes: "hello" }),
      buildRecord("3", { notes: "" }),
      buildRecord("4", {}),
    ];

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("2");
  });

  it('applyFilters "is true" and "is false" work on booleans', () => {
    const { result } = renderHook(() => useCollectionFilters());

    const fields = [
      buildField({ field_key: "active", field_type: "boolean" }),
    ];
    const records = [
      buildRecord("1", { active: true }),
      buildRecord("2", { active: false }),
      buildRecord("3", { active: null }),
    ];

    act(() => {
      result.current.addCondition("active", "is true");
    });

    let filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");

    act(() => {
      result.current.clearAll();
    });
    act(() => {
      result.current.addCondition("active", "is false");
    });

    filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual(["2", "3"]);
  });

  it('applyFilters numeric operators "=", ">", "<"', () => {
    const { result } = renderHook(() => useCollectionFilters());

    const fields = [
      buildField({ field_key: "score", field_type: "number" }),
    ];
    const records = [
      buildRecord("1", { score: 10 }),
      buildRecord("2", { score: 20 }),
      buildRecord("3", { score: 30 }),
    ];

    // "="
    act(() => {
      result.current.addCondition("score", "=");
    });
    let id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "20" });
    });

    let filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("2");

    // ">"
    act(() => {
      result.current.clearAll();
    });
    act(() => {
      result.current.addCondition("score", ">");
    });
    id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "15" });
    });

    filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual(["2", "3"]);

    // "<"
    act(() => {
      result.current.clearAll();
    });
    act(() => {
      result.current.addCondition("score", "<");
    });
    id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "25" });
    });

    filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it('applyFilters "before" and "after" for dates', () => {
    const { result } = renderHook(() => useCollectionFilters());

    const fields = [buildField({ field_key: "due", field_type: "date" })];
    const records = [
      buildRecord("1", { due: "2024-01-10" }),
      buildRecord("2", { due: "2024-06-15" }),
      buildRecord("3", { due: "2024-12-20" }),
      buildRecord("4", { due: null }),
    ];

    // "before"
    act(() => {
      result.current.addCondition("due", "before");
    });
    let id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "2024-07-01" });
    });

    let filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual(["1", "2"]);

    // "after"
    act(() => {
      result.current.clearAll();
    });
    act(() => {
      result.current.addCondition("due", "after");
    });
    id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "2024-06-01" });
    });

    filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.id)).toEqual(["2", "3"]);
  });

  it('applyFilters "is" for select fields matches exact value', () => {
    const { result } = renderHook(() => useCollectionFilters());

    const fields = [
      buildField({
        field_key: "priority",
        field_type: "select",
        options: {
          choices: [
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ],
        },
      }),
    ];
    const records = [
      buildRecord("1", { priority: "high" }),
      buildRecord("2", { priority: "medium" }),
      buildRecord("3", { priority: "low" }),
    ];

    act(() => {
      result.current.addCondition("priority", "is");
    });
    const id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "high" });
    });

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });

  it("applyFilters with multiple conditions uses AND logic", () => {
    const { result } = renderHook(() => useCollectionFilters());

    const fields = [
      buildField({ field_key: "name", field_type: "text" }),
      buildField({
        id: "f-2",
        field_key: "score",
        field_type: "number",
      }),
    ];
    const records = [
      buildRecord("1", { name: "Alice", score: 90 }),
      buildRecord("2", { name: "Alice", score: 50 }),
      buildRecord("3", { name: "Bob", score: 90 }),
    ];

    act(() => {
      result.current.addCondition("name", "contains");
    });
    const nameId = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(nameId, { value: "alice" });
    });

    act(() => {
      result.current.addCondition("score", ">");
    });
    const scoreId = result.current.conditions[1].id;
    act(() => {
      result.current.updateCondition(scoreId, { value: "80" });
    });

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("1");
  });

  it("applyFilters ignores conditions for unknown fields", () => {
    const { result } = renderHook(() => useCollectionFilters());

    act(() => {
      result.current.addCondition("nonexistent_field", "contains");
    });
    const id = result.current.conditions[0].id;
    act(() => {
      result.current.updateCondition(id, { value: "something" });
    });

    const fields = [buildField({ field_key: "name", field_type: "text" })];
    const records = [
      buildRecord("1", { name: "Alice" }),
      buildRecord("2", { name: "Bob" }),
    ];

    const filtered = result.current.applyFilters(records, fields);
    expect(filtered).toHaveLength(2);
  });
});

describe("CollectionFilterBar", () => {
  it("renders Filter button", () => {
    render(
      <CollectionFilterBar
        fields={[buildField()]}
        conditions={[]}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /filter/i })).toBeInTheDocument();
  });

  it("shows condition count badge when conditions exist", () => {
    const conditions = [
      { id: "f-1", fieldKey: "name", operator: "contains", value: "test" },
      { id: "f-2", fieldKey: "email", operator: "equals", value: "a@b.com" },
    ];

    render(
      <CollectionFilterBar
        fields={[
          buildField({ field_key: "name", field_type: "text" }),
          buildField({
            id: "f-2",
            field_key: "email",
            field_type: "email",
            label: "Email",
          }),
        ]}
        conditions={conditions}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    const badge = screen.getByText("2");
    expect(badge).toBeInTheDocument();
  });
});
