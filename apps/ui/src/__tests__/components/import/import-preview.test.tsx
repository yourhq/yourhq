import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type {
  ColumnMapping,
  DuplicateStrategy,
  ValidatedRow,
} from "@/lib/import/types";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { PreviewStep } from "@/components/import/preview-step";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MAPPINGS: ColumnMapping[] = [
  { sourceColumn: "Name", destinationField: "name", isCustomField: false },
  { sourceColumn: "Email", destinationField: "email", isCustomField: false },
  { sourceColumn: "Skipped", destinationField: null, isCustomField: false },
];

function makeRow(
  index: number,
  data: Record<string, unknown>,
  errors: ValidatedRow["errors"] = [],
  isValid = true
): ValidatedRow {
  return { index, data, errors, isValid };
}

const VALID_ROWS: ValidatedRow[] = [
  makeRow(0, { name: "Alice", email: "alice@test.com" }),
  makeRow(1, { name: "Bob", email: "bob@test.com" }),
  makeRow(2, { name: "Carol", email: "carol@test.com" }),
];

const MIXED_ROWS: ValidatedRow[] = [
  makeRow(0, { name: "Alice", email: "alice@test.com" }),
  makeRow(1, { name: "", email: "bad" }, [
    { row: 1, field: "name", message: "Name is required", severity: "error" },
    { row: 1, field: "email", message: "Invalid email format", severity: "error" },
  ], false),
  makeRow(2, { name: "Carol", email: "carol@test.com" }, [
    { row: 2, field: "email", message: "Possible duplicate email", severity: "warning" },
  ], true),
];

describe("PreviewStep", () => {
  it("shows valid row count with ready label", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("shows error count when rows have errors", () => {
    render(
      <PreviewStep
        rows={MIXED_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText(/error.*will be skipped/i)).toBeInTheDocument();
  });

  it("shows warning count when rows have warnings", () => {
    render(
      <PreviewStep
        rows={MIXED_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    const warningTexts = screen.getAllByText("1");
    expect(warningTexts.length).toBeGreaterThan(0);
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("renders column headers from active mappings only", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
  });

  it("renders row number column", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("#")).toBeInTheDocument();
  });

  it("renders preview data cells", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });

  it("shows duplicate count and strategy selector when duplicates exist", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={2}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText(/2 potential duplicates/)).toBeInTheDocument();
  });

  it("does not show duplicate section when count is 0", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.queryByText(/potential duplicate/)).not.toBeInTheDocument();
  });

  it("shows singular duplicate label for count of 1", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={1}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText(/1 potential duplicate$/)).toBeInTheDocument();
  });

  it("applies error styling to invalid rows", () => {
    const { container } = render(
      <PreviewStep
        rows={MIXED_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    const tbodyRows = container.querySelectorAll("tbody tr");
    const invalidRow = tbodyRows[1];
    expect(invalidRow.className).toContain("bg-destructive");
  });

  it("shows truncation message when rows exceed max preview", () => {
    const manyRows = Array.from({ length: 60 }, (_, i) =>
      makeRow(i, { name: `Person ${i}`, email: `p${i}@test.com` })
    );

    render(
      <PreviewStep
        rows={manyRows}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText(/showing first 50 of 60 rows/i)).toBeInTheDocument();
  });

  it("does not show truncation message when rows fit within preview limit", () => {
    render(
      <PreviewStep
        rows={VALID_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.queryByText(/showing first/i)).not.toBeInTheDocument();
  });

  it("handles custom fields by stripping extended. prefix from header", () => {
    const customMappings: ColumnMapping[] = [
      { sourceColumn: "Name", destinationField: "name", isCustomField: false },
      { sourceColumn: "Tier", destinationField: "extended.tier", isCustomField: true },
    ];

    const rows: ValidatedRow[] = [
      makeRow(0, { name: "Alice", extended: { tier: "gold" } }),
    ];

    render(
      <PreviewStep
        rows={rows}
        mappings={customMappings}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("tier")).toBeInTheDocument();
    expect(screen.getByText("gold")).toBeInTheDocument();
  });

  it("renders error messages inside tooltip content for cells with errors", () => {
    render(
      <PreviewStep
        rows={MIXED_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Invalid email format")).toBeInTheDocument();
  });

  it("shows warning message in tooltip for warning cells", () => {
    render(
      <PreviewStep
        rows={MIXED_ROWS}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("Possible duplicate email")).toBeInTheDocument();
  });

  it("uses plural errors label when count is more than 1", () => {
    const multiError: ValidatedRow[] = [
      makeRow(0, { name: "" }, [
        { row: 0, field: "name", message: "Required", severity: "error" },
      ], false),
      makeRow(1, { name: "" }, [
        { row: 1, field: "name", message: "Required", severity: "error" },
      ], false),
    ];

    render(
      <PreviewStep
        rows={multiError}
        mappings={MAPPINGS}
        duplicateCount={0}
        duplicateStrategy="skip"
        onDuplicateStrategyChange={vi.fn()}
      />
    );

    expect(screen.getByText("errors (will be skipped)")).toBeInTheDocument();
  });
});
