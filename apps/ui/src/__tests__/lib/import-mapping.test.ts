import { describe, test, expect } from "vitest";
import { autoDetectMappings, getDestinationFields } from "@/lib/import/mapping";
import type { FieldDefinition } from "@/lib/fields/types";

function makeFd(overrides: Partial<FieldDefinition>): FieldDefinition {
  return {
    id: "1", created_at: "", entity_type: "contact", field_key: "custom",
    field_type: "text", label: "Custom", field_group: null, sort_order: 0,
    required: false, options: null, description: null, is_active: true,
    ...overrides,
  };
}

describe("getDestinationFields", () => {
  test("returns core contact fields with 'Core' group", () => {
    const result = getDestinationFields("contact", []);
    expect(result.some((f) => f.key === "name" && f.group === "Core")).toBe(true);
    expect(result.some((f) => f.key === "email" && f.group === "Core")).toBe(true);
    expect(result.some((f) => f.key === "tags" && f.group === "Core")).toBe(true);
  });

  test("returns core organization fields for org entity type", () => {
    const result = getDestinationFields("organization", []);
    expect(result.some((f) => f.key === "industry")).toBe(true);
    expect(result.some((f) => f.key === "size")).toBe(true);
    expect(result.some((f) => f.key === "type")).toBe(true);
  });

  test("includes active custom fields with extended. prefix", () => {
    const fd = makeFd({ field_key: "revenue", label: "Revenue", field_group: "Finance" });
    const result = getDestinationFields("contact", [fd]);
    const custom = result.find((f) => f.key === "extended.revenue");
    expect(custom).toBeDefined();
    expect(custom!.label).toBe("Revenue");
    expect(custom!.group).toBe("Finance");
  });

  test("uses 'Custom' group when field_group is null", () => {
    const fd = makeFd({ field_key: "misc", label: "Misc", field_group: null });
    const result = getDestinationFields("contact", [fd]);
    const custom = result.find((f) => f.key === "extended.misc");
    expect(custom!.group).toBe("Custom");
  });

  test("excludes inactive custom fields", () => {
    const fd = makeFd({ field_key: "old", label: "Old", is_active: false });
    const result = getDestinationFields("contact", [fd]);
    expect(result.find((f) => f.key === "extended.old")).toBeUndefined();
  });
});

describe("autoDetectMappings", () => {
  describe("exact and alias matching", () => {
    test("matches exact field names", () => {
      const mappings = autoDetectMappings(["name", "email", "phone"], "contact", []);
      expect(mappings[0].destinationField).toBe("name");
      expect(mappings[1].destinationField).toBe("email");
      expect(mappings[2].destinationField).toBe("phone");
    });

    test("matches common email aliases", () => {
      for (const alias of ["Email Address", "E-mail", "mail"]) {
        const [m] = autoDetectMappings([alias], "contact", []);
        expect(m.destinationField).toBe("email");
      }
    });

    test("matches phone aliases", () => {
      for (const alias of ["Phone Number", "telephone", "mobile", "cell"]) {
        const [m] = autoDetectMappings([alias], "contact", []);
        expect(m.destinationField).toBe("phone");
      }
    });

    test("matches LinkedIn aliases", () => {
      for (const alias of ["LinkedIn", "LinkedIn URL", "linkedin_url"]) {
        const [m] = autoDetectMappings([alias], "contact", []);
        expect(m.destinationField).toBe("linkedin_url");
      }
    });

    test("matches title aliases", () => {
      for (const alias of ["Job Title", "role", "position"]) {
        const [m] = autoDetectMappings([alias], "contact", []);
        expect(m.destinationField).toBe("title");
      }
    });

    test("matches name aliases", () => {
      for (const alias of ["Full Name", "contact name", "display name"]) {
        const [m] = autoDetectMappings([alias], "contact", []);
        expect(m.destinationField).toBe("name");
      }
    });

    test("matches source aliases", () => {
      for (const alias of ["Lead Source", "origin", "channel"]) {
        const [m] = autoDetectMappings([alias], "contact", []);
        expect(m.destinationField).toBe("source");
      }
    });

    test("matches status/stage aliases", () => {
      for (const alias of ["stage", "pipeline stage"]) {
        const [m] = autoDetectMappings([alias], "contact", []);
        expect(m.destinationField).toBe("status");
      }
    });

    test("matches organization-specific aliases", () => {
      const mappings = autoDetectMappings(["industry", "headcount"], "organization", []);
      expect(mappings[0].destinationField).toBe("industry");
      expect(mappings[1].destinationField).toBe("size");
    });
  });

  describe("case and format insensitivity", () => {
    test("matches regardless of case", () => {
      const [m] = autoDetectMappings(["EMAIL ADDRESS"], "contact", []);
      expect(m.destinationField).toBe("email");
    });

    test("normalizes underscores and hyphens to spaces", () => {
      const [m] = autoDetectMappings(["phone_number"], "contact", []);
      expect(m.destinationField).toBe("phone");
    });

    test("trims whitespace from headers", () => {
      const [m] = autoDetectMappings(["  email  "], "contact", []);
      expect(m.destinationField).toBe("email");
    });
  });

  describe("unrecognized headers", () => {
    test("sets null destination for unrecognized columns", () => {
      const [m] = autoDetectMappings(["favorite_color"], "contact", []);
      expect(m.destinationField).toBeNull();
      expect(m.isCustomField).toBe(false);
    });

    test("preserves original sourceColumn name", () => {
      const [m] = autoDetectMappings(["My Custom Column"], "contact", []);
      expect(m.sourceColumn).toBe("My Custom Column");
    });
  });

  describe("duplicate prevention", () => {
    test("only maps the first matching header to a destination", () => {
      const mappings = autoDetectMappings(["email", "e-mail"], "contact", []);
      expect(mappings[0].destinationField).toBe("email");
      expect(mappings[1].destinationField).toBeNull();
    });

    test("does not map two headers to the same core field", () => {
      const mappings = autoDetectMappings(["Full Name", "name"], "contact", []);
      const nameCount = mappings.filter((m) => m.destinationField === "name").length;
      expect(nameCount).toBe(1);
    });
  });

  describe("custom field detection", () => {
    test("matches by custom field field_key", () => {
      const fd = makeFd({ field_key: "revenue", label: "Revenue" });
      const [m] = autoDetectMappings(["revenue"], "contact", [fd]);
      expect(m.destinationField).toBe("extended.revenue");
      expect(m.isCustomField).toBe(true);
    });

    test("matches by custom field label", () => {
      const fd = makeFd({ field_key: "annual_rev", label: "Annual Revenue" });
      const [m] = autoDetectMappings(["Annual Revenue"], "contact", [fd]);
      expect(m.destinationField).toBe("extended.annual_rev");
      expect(m.isCustomField).toBe(true);
    });

    test("excludes inactive custom fields from matching", () => {
      const fd = makeFd({ field_key: "old_field", label: "Old", is_active: false });
      const [m] = autoDetectMappings(["old_field"], "contact", [fd]);
      expect(m.destinationField).toBeNull();
    });

    test("custom field with same key as core field overwrites core alias", () => {
      const fd = makeFd({ field_key: "name", label: "Name" });
      const [m] = autoDetectMappings(["name"], "contact", [fd]);
      expect(m.destinationField).toBe("extended.name");
      expect(m.isCustomField).toBe(true);
    });
  });

  describe("entity type scoping", () => {
    test("does not match contact-only fields for organizations", () => {
      const mappings = autoDetectMappings(["relationship_strength"], "organization", []);
      expect(mappings[0].destinationField).toBeNull();
    });

    test("does not match org-only fields for contacts", () => {
      const mappings = autoDetectMappings(["industry"], "contact", []);
      expect(mappings[0].destinationField).toBeNull();
    });
  });

  describe("full header set scenario", () => {
    test("maps a realistic CSV header row", () => {
      const headers = ["Full Name", "Email Address", "Phone Number", "Company", "Job Title", "Tags", "Notes"];
      const mappings = autoDetectMappings(headers, "contact", []);
      const mapped = Object.fromEntries(mappings.map((m) => [m.sourceColumn, m.destinationField]));

      expect(mapped["Full Name"]).toBe("name");
      expect(mapped["Email Address"]).toBe("email");
      expect(mapped["Phone Number"]).toBe("phone");
      expect(mapped["Company"]).toBe("company");
      expect(mapped["Job Title"]).toBe("title");
      expect(mapped["Tags"]).toBe("tags");
      expect(mapped["Notes"]).toBe("notes");
    });
  });
});
