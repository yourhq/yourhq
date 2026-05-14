import { describe, test, expect } from "vitest";
import { validateRows } from "@/lib/import/validate";
import type { ImportContext } from "@/lib/import/types";
import type { FieldDefinition, PipelineStage } from "@/lib/fields/types";

function makeCtx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    entityType: "contact",
    fieldDefinitions: [],
    stages: [
      { id: "1", created_at: "", entity_type: "contact", stage_key: "new", label: "New", color: null, sort_order: 0, is_terminal: false, is_default: true },
      { id: "2", created_at: "", entity_type: "contact", stage_key: "qualified", label: "Qualified", color: null, sort_order: 1, is_terminal: false, is_default: false },
    ],
    defaultStageKey: "new",
    ...overrides,
  };
}

function makeFd(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: "1", created_at: "", entity_type: "contact", field_key: "custom",
    field_type: "text", label: "Custom", field_group: null, sort_order: 0,
    required: false, options: null, description: null, is_active: true,
    ...overrides,
  };
}

describe("validateRows", () => {
  describe("name field", () => {
    test("requires name — error severity", () => {
      const rows = [{ name: "" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.isValid).toBe(false);
      const nameErr = result.errors.find((e) => e.field === "name");
      expect(nameErr).toBeDefined();
      expect(nameErr!.severity).toBe("error");
    });

    test("passes with a non-empty name", () => {
      const rows = [{ name: "Alice" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.errors.filter((e) => e.field === "name")).toHaveLength(0);
      expect(result.isValid).toBe(true);
    });

    test("whitespace-only name is treated as missing", () => {
      const rows = [{ name: "   " }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.isValid).toBe(false);
    });
  });

  describe("email validation", () => {
    test("warns on invalid email format", () => {
      const rows = [{ name: "A", email: "not-an-email" }];
      const [result] = validateRows(rows, makeCtx());
      const emailErr = result.errors.find((e) => e.field === "email");
      expect(emailErr).toBeDefined();
      expect(emailErr!.severity).toBe("warning");
    });

    test("passes valid emails", () => {
      const rows = [{ name: "A", email: "alice@example.com" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.errors.filter((e) => e.field === "email")).toHaveLength(0);
    });

    test("skips validation for empty email", () => {
      const rows = [{ name: "A", email: "" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.errors.filter((e) => e.field === "email")).toHaveLength(0);
    });

    test("invalid email is a warning, not an error — row stays valid", () => {
      const rows = [{ name: "A", email: "bad" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.isValid).toBe(true);
    });
  });

  describe("priority validation", () => {
    test("warns on invalid priority with the actual value in the message", () => {
      const rows = [{ name: "A", priority: "critical" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "priority");
      expect(err).toBeDefined();
      expect(err!.message).toContain("critical");
    });

    test("passes valid priorities", () => {
      for (const p of ["urgent", "high", "medium", "low"]) {
        const rows = [{ name: "A", priority: p }];
        const [result] = validateRows(rows, makeCtx());
        expect(result.errors.filter((e) => e.field === "priority")).toHaveLength(0);
      }
    });
  });

  describe("status / stage validation", () => {
    test("warns when stage is not recognized", () => {
      const rows = [{ name: "A", status: "nonexistent" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "status");
      expect(err).toBeDefined();
      expect(err!.message).toContain("nonexistent");
      expect(err!.message).toContain("default");
    });

    test("matches by stage_key", () => {
      const rows = [{ name: "A", status: "qualified" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.errors.filter((e) => e.field === "status")).toHaveLength(0);
    });

    test("matches by label case-insensitively", () => {
      const rows = [{ name: "A", status: "QUALIFIED" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.errors.filter((e) => e.field === "status")).toHaveLength(0);
    });
  });

  describe("relationship_strength validation", () => {
    test("warns on invalid strength value", () => {
      const rows = [{ name: "A", relationship_strength: "best_friend" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "relationship_strength");
      expect(err).toBeDefined();
    });
  });

  describe("last_contact_date validation", () => {
    test("warns on unparseable date", () => {
      const rows = [{ name: "A", last_contact_date: "yesterday" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "last_contact_date");
      expect(err).toBeDefined();
      expect(err!.message).toContain("yesterday");
    });

    test("passes valid date strings", () => {
      const rows = [{ name: "A", last_contact_date: "2024-03-15" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.errors.filter((e) => e.field === "last_contact_date")).toHaveLength(0);
    });
  });

  describe("URL fields", () => {
    test("warns when URL is missing protocol", () => {
      const rows = [{ name: "A", linkedin_url: "linkedin.com/in/alice" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "linkedin_url");
      expect(err).toBeDefined();
      expect(err!.message).toContain("https://");
    });

    test("passes URLs with http or https", () => {
      const rows = [{ name: "A", linkedin_url: "https://linkedin.com/in/alice" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.errors.filter((e) => e.field === "linkedin_url")).toHaveLength(0);
    });

    test("applies to all URL field types", () => {
      for (const field of ["linkedin_url", "twitter_url", "website_url", "website"]) {
        const rows = [{ name: "A", [field]: "example.com" }];
        const [result] = validateRows(rows, makeCtx());
        expect(result.errors.some((e) => e.field === field)).toBe(true);
      }
    });
  });

  describe("organization-specific fields", () => {
    test("warns on invalid org type", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "A", type: "startup" }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "type");
      expect(err).toBeDefined();
      expect(err!.message).toContain("startup");
    });

    test("warns on invalid org size", () => {
      const ctx = makeCtx({ entityType: "organization" });
      const rows = [{ name: "A", size: "5000" }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "size");
      expect(err).toBeDefined();
    });

    test("does not validate org type for contacts", () => {
      const ctx = makeCtx({ entityType: "contact" });
      const rows = [{ name: "A", type: "startup" }];
      const [result] = validateRows(rows, ctx);
      expect(result.errors.filter((e) => e.field === "type")).toHaveLength(0);
    });
  });

  describe("custom field validation", () => {
    test("required custom field emits error when empty", () => {
      const fd = makeFd({ field_key: "department", label: "Department", required: true });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { department: "" } }];
      const [result] = validateRows(rows, ctx);
      expect(result.isValid).toBe(false);
      const err = result.errors.find((e) => e.field === "department");
      expect(err!.severity).toBe("error");
      expect(err!.message).toContain("Department");
    });

    test("number field warns on non-numeric value", () => {
      const fd = makeFd({ field_key: "revenue", field_type: "number", label: "Revenue" });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { revenue: "abc" } }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "revenue");
      expect(err).toBeDefined();
      expect(err!.message).toContain("number");
    });

    test("date field warns on unparseable date", () => {
      const fd = makeFd({ field_key: "joined", field_type: "date", label: "Joined" });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { joined: "nope" } }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "joined");
      expect(err).toBeDefined();
      expect(err!.message).toContain("Joined");
    });

    test("select field warns on invalid option", () => {
      const fd = makeFd({
        field_key: "dept", field_type: "select", label: "Department",
        options: ["Engineering", "Sales", "Marketing"],
      });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { dept: "HR" } }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "dept");
      expect(err).toBeDefined();
      expect(err!.message).toContain("HR");
    });

    test("multiselect field warns on invalid options with specifics", () => {
      const fd = makeFd({
        field_key: "interests", field_type: "multiselect", label: "Interests",
        options: ["tech", "finance"],
      });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { interests: "tech, sports, art" } }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "interests");
      expect(err).toBeDefined();
      expect(err!.message).toContain("sports");
      expect(err!.message).toContain("art");
    });

    test("url custom field warns on missing protocol", () => {
      const fd = makeFd({ field_key: "profile", field_type: "url", label: "Profile URL" });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { profile: "example.com/me" } }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "profile");
      expect(err).toBeDefined();
    });

    test("boolean fields never produce validation errors", () => {
      const fd = makeFd({ field_key: "active", field_type: "boolean", label: "Active" });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { active: "maybe" } }];
      const [result] = validateRows(rows, ctx);
      expect(result.errors.filter((e) => e.field === "active")).toHaveLength(0);
    });

    test("skips validation for empty non-required custom fields", () => {
      const fd = makeFd({ field_key: "revenue", field_type: "number", label: "Revenue" });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { revenue: "" } }];
      const [result] = validateRows(rows, ctx);
      expect(result.errors.filter((e) => e.field === "revenue")).toHaveLength(0);
    });
  });

  describe("validation message quality", () => {
    test("name error is specific: 'Name is required'", () => {
      const rows = [{ name: "" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "name");
      expect(err!.message).toBe("Name is required");
    });

    test("email error mentions format, not just 'invalid'", () => {
      const rows = [{ name: "A", email: "bad" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "email");
      expect(err!.message).toMatch(/email format/i);
    });

    test("stage warning tells user the fallback behavior", () => {
      const rows = [{ name: "A", status: "xyz" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "status");
      expect(err!.message).toMatch(/default/i);
    });

    test("URL warning tells user what will happen", () => {
      const rows = [{ name: "A", website_url: "example.com" }];
      const [result] = validateRows(rows, makeCtx());
      const err = result.errors.find((e) => e.field === "website_url");
      expect(err!.message).toMatch(/https:\/\//);
    });

    test("custom field errors reference the field label, not the key", () => {
      const fd = makeFd({ field_key: "rev_usd", label: "Revenue (USD)", field_type: "number", required: true });
      const ctx = makeCtx({ fieldDefinitions: [fd] });
      const rows = [{ name: "A", extended: { rev_usd: "" } }];
      const [result] = validateRows(rows, ctx);
      const err = result.errors.find((e) => e.field === "rev_usd");
      expect(err!.message).toContain("Revenue (USD)");
    });
  });

  describe("row-level aggregation", () => {
    test("isValid is true when all errors are warnings", () => {
      const rows = [{ name: "A", email: "bad", priority: "critical" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("isValid is false when any error has severity 'error'", () => {
      const rows = [{ name: "", email: "bad" }];
      const [result] = validateRows(rows, makeCtx());
      expect(result.isValid).toBe(false);
    });

    test("row index is preserved correctly", () => {
      const rows = [{ name: "A" }, { name: "" }, { name: "C" }];
      const results = validateRows(rows, makeCtx());
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
      expect(results[2].index).toBe(2);
      expect(results[1].isValid).toBe(false);
    });
  });
});
