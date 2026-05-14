import { describe, test, expect } from "vitest";
import { diffChanges } from "@/lib/audit/log";

describe("diffChanges", () => {
  test("returns null when objects are identical", () => {
    const obj = { name: "Alice", age: 30 };
    expect(diffChanges(obj, obj)).toBeNull();
  });

  test("detects changed fields", () => {
    const before = { name: "Alice", age: 30 };
    const after = { name: "Bob", age: 30 };
    expect(diffChanges(before, after)).toEqual({
      name: { old: "Alice", new: "Bob" },
    });
  });

  test("detects multiple changed fields", () => {
    const before = { name: "Alice", age: 30, role: "dev" };
    const after = { name: "Bob", age: 31, role: "dev" };
    const result = diffChanges(before, after);
    expect(result).toEqual({
      name: { old: "Alice", new: "Bob" },
      age: { old: 30, new: 31 },
    });
  });

  test("handles new fields in after (not in before)", () => {
    const before: Record<string, unknown> = { name: "Alice" };
    const after: Record<string, unknown> = { name: "Alice", age: 30 };
    expect(diffChanges(before, after)).toEqual({
      age: { old: undefined, new: 30 },
    });
  });

  test("respects fields filter", () => {
    const before = { name: "Alice", age: 30, role: "dev" };
    const after = { name: "Bob", age: 31, role: "mgr" };
    const result = diffChanges(before, after, ["name", "role"]);
    expect(result).toEqual({
      name: { old: "Alice", new: "Bob" },
      role: { old: "dev", new: "mgr" },
    });
  });

  test("returns null when filtered fields have no changes", () => {
    const before = { name: "Alice", age: 30 };
    const after = { name: "Alice", age: 31 };
    expect(diffChanges(before, after, ["name"])).toBeNull();
  });

  test("compares objects deeply via JSON stringify", () => {
    const before = { tags: ["a", "b"] };
    const after = { tags: ["a", "c"] };
    expect(diffChanges(before, after)).toEqual({
      tags: { old: ["a", "b"], new: ["a", "c"] },
    });
  });

  test("treats identical arrays as equal", () => {
    const before = { tags: [1, 2, 3] };
    const after = { tags: [1, 2, 3] };
    expect(diffChanges(before, after)).toBeNull();
  });

  test("handles null values", () => {
    const before = { description: "hello" };
    const after = { description: null };
    expect(diffChanges(before, after as Record<string, unknown>)).toEqual({
      description: { old: "hello", new: null },
    });
  });

  test("handles nested objects", () => {
    const before = { meta: { key: "old" } };
    const after = { meta: { key: "new" } };
    expect(diffChanges(before, after)).toEqual({
      meta: { old: { key: "old" }, new: { key: "new" } },
    });
  });
});
