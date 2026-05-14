import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionKanbanView } from "@/components/collections/collection-kanban-view";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useDraggable: () => ({
    setNodeRef: vi.fn(),
    listeners: {},
    attributes: {},
    isDragging: false,
  }),
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
  useSensor: vi.fn(),
  useSensors: () => [],
  PointerSensor: class {},
  KeyboardSensor: class {},
}));

function buildField(overrides: Partial<CollectionField> = {}): CollectionField {
  return {
    id: "f-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    field_key: "status",
    field_type: "select",
    label: "Status",
    description: null,
    sort_order: 0,
    required: false,
    options: {
      choices: [
        { value: "todo", label: "To Do", color: "#3b82f6" },
        { value: "in_progress", label: "In Progress", color: "#f59e0b" },
        { value: "done", label: "Done", color: "#22c55e" },
      ],
    },
    default_value: null,
    is_title_field: false,
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
    values: { title: "Test Task", status: "todo" },
    sort_order: 0,
    archived_at: null,
    ...overrides,
  };
}

const titleField: CollectionField = buildField({
  id: "f-title",
  field_key: "title",
  field_type: "text",
  label: "Title",
  is_title_field: true,
  options: null,
  sort_order: -1,
});

const statusField = buildField();

const defaultFields = [titleField, statusField];

describe("CollectionKanbanView", () => {
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

  function renderKanban(records: CollectionRecord[] = [], fields = defaultFields) {
    return render(
      <CollectionKanbanView
        records={records}
        fields={fields}
        groupByFieldKey="status"
        titleField={titleField}
        onCellChange={onCellChange}
        onAddRecord={onAddRecord}
        onArchiveRecord={onArchiveRecord}
        onDeleteRecord={onDeleteRecord}
        onRecordClick={onRecordClick}
      />
    );
  }

  it("renders column headers from select choices", () => {
    renderKanban();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders column record counts", () => {
    const records = [
      buildRecord({ id: "r-1", values: { title: "Task 1", status: "todo" } }),
      buildRecord({ id: "r-2", values: { title: "Task 2", status: "todo" } }),
      buildRecord({ id: "r-3", values: { title: "Task 3", status: "done" } }),
    ];
    renderKanban(records);
    const countElements = screen.getAllByText("2");
    expect(countElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders record cards in their correct columns", () => {
    const records = [
      buildRecord({ id: "r-1", values: { title: "Design UI", status: "todo" } }),
      buildRecord({ id: "r-2", values: { title: "Write Tests", status: "in_progress" } }),
    ];
    renderKanban(records);
    expect(screen.getByText("Design UI")).toBeInTheDocument();
    expect(screen.getByText("Write Tests")).toBeInTheDocument();
  });

  it("renders Untitled for records without title", () => {
    const records = [
      buildRecord({ id: "r-1", values: { title: "", status: "todo" } }),
    ];
    renderKanban(records);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("renders 'Not set' column for uncategorized records", () => {
    const records = [
      buildRecord({ id: "r-1", values: { title: "No Status", status: undefined } }),
    ];
    renderKanban(records);
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("No Status")).toBeInTheDocument();
  });

  it("renders Add button per column", () => {
    renderKanban();
    const addButtons = screen.getAllByText("Add");
    expect(addButtons.length).toBe(3);
  });

  it("calls onAddRecord with defaults when column add is clicked", async () => {
    const user = userEvent.setup();
    renderKanban();
    const addButtons = screen.getAllByText("Add");
    await user.click(addButtons[0]);
    expect(onAddRecord).toHaveBeenCalledWith({ status: "todo" });
  });

  it("calls onRecordClick when a card is clicked", async () => {
    const user = userEvent.setup();
    const records = [
      buildRecord({ id: "r-1", values: { title: "Clickable Task", status: "todo" } }),
    ];
    renderKanban(records);
    await user.click(screen.getByText("Clickable Task"));
    expect(onRecordClick).toHaveBeenCalledWith("r-1");
  });

  it("renders preview fields on cards", () => {
    const extraField = buildField({
      id: "f-extra",
      field_key: "priority",
      field_type: "text",
      label: "Priority",
      is_title_field: false,
      options: null,
      sort_order: 2,
    });
    const records = [
      buildRecord({
        id: "r-1",
        values: { title: "Task", status: "todo", priority: "High" },
      }),
    ];
    render(
      <CollectionKanbanView
        records={records}
        fields={[titleField, statusField, extraField]}
        groupByFieldKey="status"
        titleField={titleField}
        onCellChange={onCellChange}
        onAddRecord={onAddRecord}
        onArchiveRecord={onArchiveRecord}
        onDeleteRecord={onDeleteRecord}
        onRecordClick={onRecordClick}
      />
    );
    expect(screen.getByText("High")).toBeInTheDocument();
  });
});
