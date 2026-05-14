import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionTableView } from "@/components/collections/collection-table-view";
import type { CollectionField, CollectionRecord, ViewConfig } from "@/lib/collections/types";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

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
    is_title_field: true,
    is_active: true,
    ...overrides,
  };
}

function buildRecord(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    id: "r-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    values: { name: "Test Record", email: "test@example.com" },
    sort_order: 0,
    archived_at: null,
    ...overrides,
  };
}

const defaultFields: CollectionField[] = [
  buildField({ id: "f-1", field_key: "name", label: "Name", is_title_field: true, sort_order: 0 }),
  buildField({ id: "f-2", field_key: "email", label: "Email", field_type: "email", is_title_field: false, sort_order: 1 }),
];

const defaultViewConfig: ViewConfig = {};

describe("CollectionTableView", () => {
  let onCellChange: ReturnType<typeof vi.fn>;
  let onAddRecord: ReturnType<typeof vi.fn>;
  let onArchiveRecord: ReturnType<typeof vi.fn>;
  let onDeleteRecord: ReturnType<typeof vi.fn>;
  let onRecordClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onCellChange = vi.fn();
    onAddRecord = vi.fn();
    onArchiveRecord = vi.fn();
    onDeleteRecord = vi.fn();
    onRecordClick = vi.fn();
  });

  function renderTable(records: CollectionRecord[] = [], fields = defaultFields, viewConfig = defaultViewConfig) {
    return render(
      <CollectionTableView
        records={records}
        fields={fields}
        viewConfig={viewConfig}
        onCellChange={onCellChange}
        onAddRecord={onAddRecord}
        onArchiveRecord={onArchiveRecord}
        onDeleteRecord={onDeleteRecord}
        onRecordClick={onRecordClick}
      />
    );
  }

  it("renders column headers from field definitions", () => {
    renderTable();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("renders rows with record data", () => {
    const records = [
      buildRecord({ id: "r-1", values: { name: "Alice", email: "alice@test.com" } }),
      buildRecord({ id: "r-2", values: { name: "Bob", email: "bob@test.com" } }),
    ];
    renderTable(records);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows Untitled for title field with empty value", () => {
    const records = [buildRecord({ id: "r-1", values: { name: "", email: "a@b.com" } })];
    renderTable(records);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("renders add record button", () => {
    renderTable();
    expect(screen.getByText("New record")).toBeInTheDocument();
  });

  it("calls onAddRecord when add button is clicked", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByText("New record"));
    expect(onAddRecord).toHaveBeenCalledOnce();
  });

  it("calls onRecordClick when title field is clicked", async () => {
    const user = userEvent.setup();
    const records = [buildRecord({ id: "r-1", values: { name: "Alice", email: "a@b.com" } })];
    renderTable(records);
    await user.click(screen.getByText("Alice"));
    expect(onRecordClick).toHaveBeenCalledWith("r-1");
  });

  it("hides fields listed in viewConfig.hidden_fields", () => {
    renderTable([], defaultFields, { hidden_fields: ["email"] });
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
  });

  it("excludes inactive fields", () => {
    const fields = [
      buildField({ id: "f-1", field_key: "name", label: "Name", is_title_field: true, sort_order: 0 }),
      buildField({ id: "f-2", field_key: "email", label: "Email", is_active: false, sort_order: 1 }),
    ];
    renderTable([], fields);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
  });

  it("renders table element", () => {
    renderTable();
    expect(document.querySelector("table")).toBeInTheDocument();
  });
});
