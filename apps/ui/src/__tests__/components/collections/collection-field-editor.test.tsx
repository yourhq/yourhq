import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionFieldEditor } from "@/components/collections/collection-field-editor";
import type { CollectionField } from "@/lib/collections/types";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn().mockReturnValue([]),
  closestCenter: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSortable: () => ({
    setNodeRef: vi.fn(),
    attributes: {},
    listeners: {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => null } },
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
    is_title_field: false,
    is_active: true,
    ...overrides,
  };
}

describe("CollectionFieldEditor", () => {
  let onAddField: ReturnType<typeof vi.fn>;
  let onUpdateField: ReturnType<typeof vi.fn>;
  let onDeleteField: ReturnType<typeof vi.fn>;
  let onReorderFields: ReturnType<typeof vi.fn>;
  let fields: CollectionField[];

  beforeEach(() => {
    onAddField = vi.fn();
    onUpdateField = vi.fn();
    onDeleteField = vi.fn();
    onReorderFields = vi.fn();
    fields = [
      buildField({ id: "f-1", field_key: "name", label: "Name", field_type: "text", sort_order: 0 }),
      buildField({ id: "f-2", field_key: "age", label: "Age", field_type: "number", sort_order: 1 }),
    ];
  });

  function renderEditor(fieldList = fields) {
    return render(
      <CollectionFieldEditor
        fields={fieldList}
        onAddField={onAddField}
        onUpdateField={onUpdateField}
        onDeleteField={onDeleteField}
        onReorderFields={onReorderFields}
      />
    );
  }

  it("renders Fields heading", () => {
    renderEditor();
    expect(screen.getByText("Fields")).toBeInTheDocument();
  });

  it("renders list of field labels", () => {
    renderEditor();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
  });

  it("renders field type labels", () => {
    renderEditor();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
  });

  it("renders Add button", () => {
    renderEditor();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("opens add field dialog when Add is clicked", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.getByRole("heading", { name: "Add Field" })).toBeInTheDocument();
    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByText("Key")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
  });

  it("Add Field button is disabled until label and key are filled", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /add/i }));
    const addFieldBtn = screen.getByRole("button", { name: "Add Field" });
    expect(addFieldBtn).toBeDisabled();
  });

  it("populates key from label automatically", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /add/i }));
    const labelInput = screen.getByPlaceholderText("e.g. Company");
    await user.type(labelInput, "Full Name");
    const keyInput = screen.getByPlaceholderText("company");
    expect(keyInput).toHaveValue("full_name");
  });

  it("calls onAddField with correct data when submitted", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /add/i }));
    const labelInput = screen.getByPlaceholderText("e.g. Company");
    await user.type(labelInput, "Company");
    const addFieldBtn = screen.getByRole("button", { name: "Add Field" });
    await user.click(addFieldBtn);
    expect(onAddField).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Company",
        field_key: "company",
        field_type: "text",
      })
    );
  });

  it("shows Required and Title field toggles in add dialog", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Title field")).toBeInTheDocument();
  });

  it("closes add dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(screen.getByRole("heading", { name: "Add Field" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("heading", { name: "Add Field" })).not.toBeInTheDocument();
  });

  it("renders empty field list", () => {
    renderEditor([]);
    expect(screen.getByText("Fields")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });
});
