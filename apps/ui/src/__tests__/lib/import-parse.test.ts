import { describe, test, expect } from "vitest";
import { parseText } from "@/lib/import/parse";

describe("parseText", () => {
  describe("CSV parsing", () => {
    test("parses basic CSV with headers", () => {
      const result = parseText("name,email\nAlice,alice@test.com\nBob,bob@test.com");
      expect(result.format).toBe("csv");
      expect(result.headers).toEqual(["name", "email"]);
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual({ name: "Alice", email: "alice@test.com" });
    });

    test("trims whitespace from headers", () => {
      const result = parseText("  name , email \nAlice,alice@test.com");
      expect(result.headers).toEqual(["name", "email"]);
    });

    test("skips empty lines", () => {
      const result = parseText("name\nAlice\n\n\nBob\n");
      expect(result.rowCount).toBe(2);
    });

    test("handles quoted fields with commas", () => {
      const result = parseText('name,notes\nAlice,"has, commas"');
      expect(result.rows[0].notes).toBe("has, commas");
    });

    test("returns empty rows for header-only input", () => {
      const result = parseText("name,email");
      expect(result.headers).toEqual(["name", "email"]);
      expect(result.rowCount).toBe(0);
    });

    test("handles empty input gracefully", () => {
      const result = parseText("");
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    test("handles duplicate headers", () => {
      const result = parseText("name,name\nAlice,Bob");
      expect(result.rowCount).toBe(1);
    });
  });

  describe("BOM stripping", () => {
    test("strips UTF-8 BOM from CSV", () => {
      const bom = "﻿";
      const result = parseText(`${bom}name,email\nAlice,a@b.com`);
      expect(result.headers).toEqual(["name", "email"]);
      expect(result.rows[0].name).toBe("Alice");
    });

    test("strips UTF-8 BOM from JSON", () => {
      const bom = "﻿";
      const result = parseText(`${bom}[{"name":"Alice"}]`);
      expect(result.format).toBe("json");
      expect(result.rows[0].name).toBe("Alice");
    });
  });

  describe("JSON parsing", () => {
    test("parses a JSON array", () => {
      const result = parseText('[{"name":"Alice","email":"a@b.com"}]');
      expect(result.format).toBe("json");
      expect(result.headers).toContain("name");
      expect(result.headers).toContain("email");
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].name).toBe("Alice");
    });

    test("parses an Airtable-style wrapper object", () => {
      const input = JSON.stringify({
        records: [{ name: "Alice" }, { name: "Bob" }],
      });
      const result = parseText(input);
      expect(result.format).toBe("json");
      expect(result.rowCount).toBe(2);
    });

    test("converts null and undefined values to empty strings", () => {
      const result = parseText('[{"name":"Alice","email":null}]');
      expect(result.rows[0].email).toBe("");
    });

    test("joins array values with comma-space", () => {
      const result = parseText('[{"name":"Alice","tags":["a","b","c"]}]');
      expect(result.rows[0].tags).toBe("a, b, c");
    });

    test("converts numeric values to strings", () => {
      const result = parseText('[{"name":"Alice","age":30}]');
      expect(result.rows[0].age).toBe("30");
    });

    test("collects headers from all records", () => {
      const result = parseText('[{"a":"1"},{"b":"2"},{"a":"3","c":"4"}]');
      expect(result.headers).toContain("a");
      expect(result.headers).toContain("b");
      expect(result.headers).toContain("c");
    });

    test("returns empty result for empty JSON array", () => {
      const result = parseText("[]");
      expect(result.format).toBe("json");
      expect(result.headers).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    test("throws on JSON object with no array property", () => {
      expect(() => parseText('{"key":"value"}')).not.toThrow();
      const result = parseText('{"key":"value"}');
      expect(result.format).toBe("csv");
    });
  });

  describe("format auto-detection", () => {
    test("detects JSON when text starts with [", () => {
      const result = parseText('[{"x":1}]');
      expect(result.format).toBe("json");
    });

    test("detects JSON when text starts with {", () => {
      const result = parseText('{"records":[{"x":1}]}');
      expect(result.format).toBe("json");
    });

    test("falls back to CSV for non-JSON text", () => {
      const result = parseText("name,email\nAlice,a@b.com");
      expect(result.format).toBe("csv");
    });

    test("falls back to CSV when JSON parse fails", () => {
      const result = parseText("{not valid json\nname,email\nAlice,a@b.com");
      expect(result.format).toBe("csv");
    });
  });

  describe("malformed CSV", () => {
    test("handles rows with fewer columns than headers", () => {
      const result = parseText("name,email,phone\nAlice,a@b.com");
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].name).toBe("Alice");
    });

    test("handles rows with more columns than headers", () => {
      const result = parseText("name\nAlice,extra,stuff");
      expect(result.rowCount).toBe(1);
      expect(result.rows[0].name).toBe("Alice");
    });

    test("handles tab-separated values as single column CSV", () => {
      const result = parseText("name\tphone\nAlice\t555");
      expect(result.rowCount).toBeGreaterThanOrEqual(1);
    });
  });
});
