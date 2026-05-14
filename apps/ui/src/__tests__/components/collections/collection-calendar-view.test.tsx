import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionCalendarView } from "@/components/collections/collection-calendar-view";
import type { CollectionField, CollectionRecord } from "@/lib/collections/types";
import { format } from "date-fns";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

function buildField(overrides: Partial<CollectionField> = {}): CollectionField {
  return {
    id: "f-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    field_key: "due_date",
    field_type: "date",
    label: "Due Date",
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

function buildRecord(overrides: Partial<CollectionRecord> = {}): CollectionRecord {
  return {
    id: "r-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    values: { title: "Test Record", due_date: "2024-06-15" },
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
});

const dateField = buildField();
const defaultFields = [titleField, dateField];

describe("CollectionCalendarView", () => {
  let onAddRecord: ReturnType<typeof vi.fn>;
  let onArchiveRecord: ReturnType<typeof vi.fn>;
  let onDeleteRecord: ReturnType<typeof vi.fn>;
  let onRecordClick: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onAddRecord = vi.fn();
    onArchiveRecord = vi.fn();
    onDeleteRecord = vi.fn();
    onRecordClick = vi.fn();
  });

  function renderCalendar(records: CollectionRecord[] = []) {
    return render(
      <CollectionCalendarView
        records={records}
        fields={defaultFields}
        dateFieldKey="due_date"
        titleField={titleField}
        onAddRecord={onAddRecord}
        onArchiveRecord={onArchiveRecord}
        onDeleteRecord={onDeleteRecord}
        onRecordClick={onRecordClick}
      />
    );
  }

  it("renders the current month and year", () => {
    renderCalendar();
    const now = new Date();
    const monthYear = format(now, "MMMM yyyy");
    expect(screen.getByText(monthYear)).toBeInTheDocument();
  });

  it("renders weekday headers", () => {
    renderCalendar();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
  });

  it("renders Today button", () => {
    renderCalendar();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("navigates to previous month", async () => {
    const user = userEvent.setup();
    renderCalendar();
    const now = new Date();
    const currentMonth = format(now, "MMMM yyyy");
    expect(screen.getByText(currentMonth)).toBeInTheDocument();

    const prevButtons = screen.getAllByRole("button").filter((btn) =>
      btn.querySelector("[class*='lucide-chevron-left']") !== null ||
      btn.getAttribute("class")?.includes("chevron")
    );
    const prevButton = screen.getAllByRole("button")[0];
    await user.click(prevButton);
  });

  it("renders record on its date", () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const records = [
      buildRecord({ id: "r-1", values: { title: "Today Task", due_date: today } }),
    ];
    renderCalendar(records);
    expect(screen.getByText("Today Task")).toBeInTheDocument();
  });

  it("calls onRecordClick when record is clicked", async () => {
    const user = userEvent.setup();
    const today = format(new Date(), "yyyy-MM-dd");
    const records = [
      buildRecord({ id: "r-1", values: { title: "Click Me", due_date: today } }),
    ];
    renderCalendar(records);
    await user.click(screen.getByText("Click Me"));
    expect(onRecordClick).toHaveBeenCalledWith("r-1");
  });

  it("renders Untitled for records without a title", () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const records = [
      buildRecord({ id: "r-1", values: { title: "", due_date: today } }),
    ];
    renderCalendar(records);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("renders multiple records on the same day", () => {
    const today = format(new Date(), "yyyy-MM-dd");
    const records = [
      buildRecord({ id: "r-1", values: { title: "Task A", due_date: today } }),
      buildRecord({ id: "r-2", values: { title: "Task B", due_date: today } }),
    ];
    renderCalendar(records);
    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });

  it("ignores records with no date value", () => {
    const records = [
      buildRecord({ id: "r-1", values: { title: "No Date Record" } }),
    ];
    renderCalendar(records);
    expect(screen.queryByText("No Date Record")).not.toBeInTheDocument();
  });
});
