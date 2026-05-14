import { describe, test, expect } from "vitest";
import { transformRows } from "@/lib/import/transform";
import type { ColumnMapping, ImportContext } from "@/lib/import/types";
import type { FieldDefinition, PipelineStage } from "@/lib/fields/types";

function makeCtx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    entityType: "contact",
    fieldDefinitions: [],
    stages: [
      { id: "1", created_at: "", entity_type: "contact", stage_key: "new", label: "New", color: null, sort_order: 0, is_terminal: false, is_default: true },
      { id: "2", created_at: "", entity_type: "contact", stage_key: "qualified", label: "Qualified", color: null, sort_order: 1, is_terminal: false, is_default: false },
      { id: "3", created_at: "", entity_type: "contact", stage_key: "closed", label: "Closed Won", color: null, sort_order: 2, is_terminal: true, is_default: false },
    ],
    defaultStageKey: "new",
    ...overrides,
  };
}

function mapping(source: string, dest: string | null, isCustom = false): ColumnMapping {
  return { sourceColumn: source, destinationField: dest, isCustomField: isCustom };
}

describe("transformRows", () => {
  describe("basic mapping", () => {
    test("maps source columns to destination fields", () => {
      const rows = [{ "Full Name": "Alice", "E-mail": "a@b.com" }];
      const mappings = [mapping("Full Name", "name"), mapping("E-mail", "email")];
      const result = transformRows(rows, mappings, makeCtx());
      expect(result[0].name).toBe("Alice");
      expect(result[0].email).toBe("a@b.com");
    });

    test("skips columns with null destination", () => {
      const rows = [{ name: "Alice", junk: "xyz" }];
      const mappings = [mapping("name", "name"), mapping("junk", null)];
      const result = transformRows(rows, mappings, makeCtx());
      expect(result[0]).not.toHaveProperty("junk");
    });

    test("sets empty strings to null for default fields", () => {
      const rows = [{ name: "Alice", phone: "" }];
      const mappings = [mapping("name", "name"), mapping("phone", "phone")];
      const result = transformRows(rows, mappings, makeCtx());
      expect(result[0].phone).toBeNull();
    });
  });

  describe("tags", () => {
    test("splits comma-separated tags", () => {
      const rows = [{ name: "Alice", tags: "vip, partner, lead" }];
      const mappings = [mapping("name", "name"), mapping("tags", "tags")];
      const result = transformRows(rows, mappings, makeCtx());
      expect(result[0].tags).toEqual(["vip", "partner", "lead"]);
    });

    test("filters out empty tags from trailing commas", () => {
      const rows = [{ name: "Alice", tags: "vip,,lead," }];
      const mappings = [mapping("name", "name"), mapping("tags", "tags")];
      const result = transformRows(rows, mappings, makeCtx());
      expect(result[0].tags).toEqual(["vip", "lead"]);
    });

    test("defaults to empty array when no tags column mapped", () => {
      const rows = [{ name: "Alice" }];
      const mappings = [mapping("name", "name")];
      const result = transformRows(rows, mappings, makeCtx());
      expect(result[0].tags).toEqual([]);
    });

    test("defaults to empty array for empty tags value", () => {
      const rows = [{ name: "Alice", tags: "" }];
      const mappings = [mapping("name", "name"), mapping("tags", "tags")];
      const result = transformRows(rows, mappings, makeCtx());
      expect(result[0].tags).toEqual([]);
    });
  });

  describe("priority normalization", () => {
    test("lowercases valid priorities", () => {
      const rows = [{ name: "A", p: "High" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("p", "priority")], makeCtx());
      expect(result[0].priority).toBe("high");
    });

    test("nulls invalid priorities", () => {
      const rows = [{ name: "A", p: "critical" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("p", "priority")], makeCtx());
      expect(result[0].priority).toBeNull();
    });

    test("accepts all four valid values", () => {
      for (const p of ["urgent", "high", "medium", "low"]) {
        const rows = [{ name: "A", p }];
        const result = transformRows(rows, [mapping("name", "name"), mapping("p", "priority")], makeCtx());
        expect(result[0].priority).toBe(p);
      }
    });
  });

  describe("status / stage matching", () => {
    test("matches by stage_key", () => {
      const rows = [{ name: "A", s: "qualified" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("s", "status")], makeCtx());
      expect(result[0].status).toBe("qualified");
    });

    test("matches by label case-insensitively", () => {
      const rows = [{ name: "A", s: "closed won" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("s", "status")], makeCtx());
      expect(result[0].status).toBe("closed");
    });

    test("falls back to default stage for unknown value", () => {
      const rows = [{ name: "A", s: "nonexistent" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("s", "status")], makeCtx());
      expect(result[0].status).toBe("new");
    });

    test("applies default status when no status column mapped", () => {
      const rows = [{ name: "A" }];
      const result = transformRows(rows, [mapping("name", "name")], makeCtx());
      expect(result[0].status).toBe("new");
    });
  });

  describe("URL auto-prefixing", () => {
    test("adds https:// to bare URLs", () => {
      const rows = [{ name: "A", li: "linkedin.com/in/alice" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("li", "linkedin_url")], makeCtx());
      expect(result[0].linkedin_url).toBe("https://linkedin.com/in/alice");
    });

    test("preserves existing http:// prefix", () => {
      const rows = [{ name: "A", w: "http://example.com" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("w", "website_url")], makeCtx());
      expect(result[0].website_url).toBe("http://example.com");
    });

    test("preserves existing https:// prefix", () => {
      const rows = [{ name: "A", w: "https://example.com" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("w", "website_url")], makeCtx());
      expect(result[0].website_url).toBe("https://example.com");
    });

    test("nulls empty URL fields", () => {
      const rows = [{ name: "A", w: "" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("w", "website_url")], makeCtx());
      expect(result[0].website_url).toBeNull();
    });

    test("applies to all URL fields including org website", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "A", w: "example.com" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("w", "website")], ctx);
      expect(result[0].website).toBe("https://example.com");
    });
  });

  describe("relationship_strength", () => {
    test("lowercases valid strength values", () => {
      const rows = [{ name: "A", rs: "Warm" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("rs", "relationship_strength")], makeCtx());
      expect(result[0].relationship_strength).toBe("warm");
    });

    test("defaults to stranger for invalid values", () => {
      const rows = [{ name: "A", rs: "best friend" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("rs", "relationship_strength")], makeCtx());
      expect(result[0].relationship_strength).toBe("stranger");
    });

    test("defaults to stranger when unmapped for contacts", () => {
      const rows = [{ name: "A" }];
      const result = transformRows(rows, [mapping("name", "name")], makeCtx());
      expect(result[0].relationship_strength).toBe("stranger");
    });
  });

  describe("last_contact_date", () => {
    test("converts valid dates to ISO string", () => {
      const rows = [{ name: "A", d: "2024-01-15" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("d", "last_contact_date")], makeCtx());
      expect(result[0].last_contact_date).toContain("2024-01-15");
    });

    test("nulls unparseable dates", () => {
      const rows = [{ name: "A", d: "not a date" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("d", "last_contact_date")], makeCtx());
      expect(result[0].last_contact_date).toBeNull();
    });
  });

  describe("organization-specific fields", () => {
    test("validates org type", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "A", t: "Agency" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("t", "type")], ctx);
      expect(result[0].type).toBe("agency");
    });

    test("nulls invalid org type", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "A", t: "startup" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("t", "type")], ctx);
      expect(result[0].type).toBeNull();
    });

    test("validates org size", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "A", s: "51-200" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("s", "size")], ctx);
      expect(result[0].size).toBe("51-200");
    });

    test("nulls invalid org size", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "A", s: "5000" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("s", "size")], ctx);
      expect(result[0].size).toBeNull();
    });
  });

  describe("custom field handling", () => {
    const numberField: FieldDefinition = {
      id: "1", created_at: "", entity_type: "contact", field_key: "revenue",
      field_type: "number", label: "Revenue", field_group: null, sort_order: 0,
      required: false, options: null, description: null, is_active: true,
    };

    const boolField: FieldDefinition = {
      id: "2", created_at: "", entity_type: "contact", field_key: "is_vip",
      field_type: "boolean", label: "VIP", field_group: null, sort_order: 1,
      required: false, options: null, description: null, is_active: true,
    };

    const multiselectField: FieldDefinition = {
      id: "3", created_at: "", entity_type: "contact", field_key: "interests",
      field_type: "multiselect", label: "Interests", field_group: null, sort_order: 2,
      required: false, options: ["tech", "finance", "design"], description: null, is_active: true,
    };

    const dateField: FieldDefinition = {
      id: "4", created_at: "", entity_type: "contact", field_key: "joined",
      field_type: "date", label: "Joined", field_group: null, sort_order: 3,
      required: false, options: null, description: null, is_active: true,
    };

    test("parses number custom fields", () => {
      const ctx = makeCtx({ fieldDefinitions: [numberField] });
      const rows = [{ name: "A", rev: "1500.50" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("rev", "extended.revenue", true)], ctx);
      expect((result[0].extended as Record<string, unknown>).revenue).toBe(1500.5);
    });

    test("falls back to 0 for non-numeric number fields", () => {
      const ctx = makeCtx({ fieldDefinitions: [numberField] });
      const rows = [{ name: "A", rev: "abc" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("rev", "extended.revenue", true)], ctx);
      expect((result[0].extended as Record<string, unknown>).revenue).toBe(0);
    });

    test("parses boolean custom fields", () => {
      const ctx = makeCtx({ fieldDefinitions: [boolField] });
      for (const truthy of ["true", "yes", "1", "y", "on"]) {
        const rows = [{ name: "A", vip: truthy }];
        const result = transformRows(rows, [mapping("name", "name"), mapping("vip", "extended.is_vip", true)], ctx);
        expect((result[0].extended as Record<string, unknown>).is_vip).toBe(true);
      }
    });

    test("boolean false for non-truthy strings", () => {
      const ctx = makeCtx({ fieldDefinitions: [boolField] });
      const rows = [{ name: "A", vip: "no" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("vip", "extended.is_vip", true)], ctx);
      expect((result[0].extended as Record<string, unknown>).is_vip).toBe(false);
    });

    test("splits multiselect custom fields", () => {
      const ctx = makeCtx({ fieldDefinitions: [multiselectField] });
      const rows = [{ name: "A", int: "tech, finance" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("int", "extended.interests", true)], ctx);
      expect((result[0].extended as Record<string, unknown>).interests).toEqual(["tech", "finance"]);
    });

    test("parses date custom fields to ISO", () => {
      const ctx = makeCtx({ fieldDefinitions: [dateField] });
      const rows = [{ name: "A", j: "2024-06-01" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("j", "extended.joined", true)], ctx);
      expect((result[0].extended as Record<string, unknown>).joined).toContain("2024-06-01");
    });

    test("skips empty custom field values", () => {
      const ctx = makeCtx({ fieldDefinitions: [numberField] });
      const rows = [{ name: "A", rev: "" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("rev", "extended.revenue", true)], ctx);
      expect(result[0].extended).toEqual({});
    });

    test("stores unknown custom fields as plain strings", () => {
      const rows = [{ name: "A", misc: "hello" }];
      const result = transformRows(rows, [mapping("name", "name"), mapping("misc", "extended.misc", true)], makeCtx());
      expect((result[0].extended as Record<string, unknown>).misc).toBe("hello");
    });
  });

  describe("defaults", () => {
    test("always sets extended even when no custom fields are mapped", () => {
      const rows = [{ name: "A" }];
      const result = transformRows(rows, [mapping("name", "name")], makeCtx());
      expect(result[0].extended).toEqual({});
    });

    test("does not default relationship_strength for organizations", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "Acme" }];
      const result = transformRows(rows, [mapping("name", "name")], ctx);
      expect(result[0]).not.toHaveProperty("relationship_strength");
    });
  });
});
