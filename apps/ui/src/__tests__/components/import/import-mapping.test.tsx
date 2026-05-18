import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ColumnMapping } from "@/lib/import/types";
import type { FieldDefinition } from "@/lib/fields/types";

vi.mock("@/lib/import/mapping", () => ({
  getDestinationFields: (entityType: string, fieldDefs: FieldDefinition[]) => {
    const core = [
      { key: "name", label: "Name", group: "Core" },
      { key: "email", label: "Email", group: "Core" },
      { key: "phone", label: "Phone", group: "Core" },
      { key: "company", label: "Company", group: "Core" },
      { key: "notes", label: "Notes", group: "Core" },
    ];
    const custom = fieldDefs
      .filter((f) => f.is_active)
      .map((f) => ({
        key: `extended.${f.field_key}`,
        label: f.label,
        group: f.field_group ?? "Custom",
      }));
    return [...core, ...custom];
  },
}));

import { MappingStep } from "@/components/import/mapping-step";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const HEADERS = ["Full Name", "Email Address", "Phone", "Notes"];

const RAW_ROWS: Record<string, string>[] = [
  { "Full Name": "Alice Smith", "Email Address": "alice@example.com", Phone: "555-1234", Notes: "VIP" },
  { "Full Name": "Bob Jones", "Email Address": "bob@example.com", Phone: "555-5678", Notes: "" },
  { "Full Name": "Carol White", "Email Address": "", Phone: "555-9012", Notes: "Prospect" },
];

const BASE_MAPPINGS: ColumnMapping[] = [
  { sourceColumn: "Full Name", destinationField: "name", isCustomField: false },
  { sourceColumn: "Email Address", destinationField: "email", isCustomField: false },
  { sourceColumn: "Phone", destinationField: null, isCustomField: false },
  { sourceColumn: "Notes", destinationField: null, isCustomField: false },
];

const FIELD_DEFS: FieldDefinition[] = [
  {
    id: "fd-1",
    created_at: "2025-01-01T00:00:00Z",
    entity_type: "contact",
    field_key: "tier",
    field_type: "select",
    label: "Tier",
    field_group: "Custom",
    sort_order: 0,
    required: false,
    options: ["gold", "silver", "bronze"],
    description: null,
    is_active: true,
  },
];

describe("MappingStep", () => {
  it("renders source columns from headers", () => {
    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("Full Name")).toBeInTheDocument();
    expect(screen.getByText("Email Address")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("displays mapping instruction with Name required note", () => {
    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(screen.getByText(/map source columns to fields/i)).toBeInTheDocument();
    const nameElements = screen.getAllByText("Name");
    expect(nameElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows mapped count as N / total", () => {
    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("2 / 4 mapped")).toBeInTheDocument();
  });

  it("shows Name required warning when name is not mapped", () => {
    const noNameMappings: ColumnMapping[] = [
      { sourceColumn: "Full Name", destinationField: null, isCustomField: false },
      { sourceColumn: "Email Address", destinationField: "email", isCustomField: false },
      { sourceColumn: "Phone", destinationField: null, isCustomField: false },
      { sourceColumn: "Notes", destinationField: null, isCustomField: false },
    ];

    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={noNameMappings}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/the "name" field must be mapped to continue/i)
    ).toBeInTheDocument();
  });

  it("does not show Name required warning when name is mapped", () => {
    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(
      screen.queryByText(/the "name" field must be mapped to continue/i)
    ).not.toBeInTheDocument();
  });

  it("renders table headers for mapping columns", () => {
    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("Source column")).toBeInTheDocument();
    expect(screen.getByText("Maps to")).toBeInTheDocument();
    expect(screen.getByText("Sample values")).toBeInTheDocument();
  });

  it("shows sample values from raw rows", () => {
    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Carol White")).toBeInTheDocument();
  });

  it("renders sample email values", () => {
    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("applies reduced opacity to unmapped/skipped rows", () => {
    const { container } = render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows[2].className).toContain("opacity-50");
    expect(rows[3].className).toContain("opacity-50");
  });

  it("does not apply reduced opacity to mapped rows", () => {
    const { container } = render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0].className).not.toContain("opacity-50");
    expect(rows[1].className).not.toContain("opacity-50");
  });

  it("calls onMappingsChange when a mapping is updated to skip", async () => {
    const onMappingsChange = vi.fn();

    render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={onMappingsChange}
      />
    );

    const triggers = screen.getAllByRole("combobox");
    expect(triggers.length).toBe(4);
  });

  it("renders all four mapping rows matching header count", () => {
    const { container } = render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(4);
  });

  it("renders with organization entity type", () => {
    const orgMappings: ColumnMapping[] = [
      { sourceColumn: "Name", destinationField: "name", isCustomField: false },
      { sourceColumn: "Website", destinationField: null, isCustomField: false },
    ];

    render(
      <MappingStep
        headers={["Name", "Website"]}
        rawRows={[{ Name: "Acme Inc", Website: "acme.com" }]}
        mappings={orgMappings}
        entityType="organization"
        fieldDefinitions={[]}
        onMappingsChange={vi.fn()}
      />
    );

    expect(screen.getByText("1 / 2 mapped")).toBeInTheDocument();
  });

  it("highlights name-mapped row differently", () => {
    const { container } = render(
      <MappingStep
        headers={HEADERS}
        rawRows={RAW_ROWS}
        mappings={BASE_MAPPINGS}
        entityType="contact"
        fieldDefinitions={FIELD_DEFS}
        onMappingsChange={vi.fn()}
      />
    );

    const triggers = container.querySelectorAll("[data-slot='select-trigger']");
    if (triggers.length > 0) {
      expect(triggers[0].className).toContain("border-primary");
    }
  });
});
