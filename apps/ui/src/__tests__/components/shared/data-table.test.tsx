import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  type ColumnDef,
} from "@tanstack/react-table";
import { DataTable } from "@/components/shared/data-table";

vi.mock("@/components/ui/table", () => ({
  Table: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <table className={className}>{children}</table>,
  TableBody: ({ children }: { children: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableCell: ({
    children,
    colSpan,
    className,
  }: {
    children: React.ReactNode;
    colSpan?: number;
    className?: string;
  }) => (
    <td colSpan={colSpan} className={className}>
      {children}
    </td>
  ),
  TableHead: ({
    children,
    colSpan,
    className,
  }: {
    children: React.ReactNode;
    colSpan?: number;
    className?: string;
  }) => (
    <th colSpan={colSpan} className={className}>
      {children}
    </th>
  ),
  TableHeader: ({ children }: { children: React.ReactNode }) => (
    <thead>{children}</thead>
  ),
  TableRow: ({
    children,
    onClick,
    className,
    ...props
  }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr onClick={onClick} className={className} {...props}>
      {children}
    </tr>
  ),
}));

interface TestRow {
  id: string;
  name: string;
  age: number;
}

const testData: TestRow[] = [
  { id: "1", name: "Alice", age: 30 },
  { id: "2", name: "Bob", age: 25 },
  { id: "3", name: "Charlie", age: 35 },
];

const columnHelper = createColumnHelper<TestRow>();

const columns: ColumnDef<TestRow, unknown>[] = [
  columnHelper.accessor("name", { header: "Name" }),
  columnHelper.accessor("age", { header: "Age" }),
];

function TestDataTable({
  data = testData,
  emptyState,
  onRowClick,
  isLoading,
}: {
  data?: TestRow[];
  emptyState?: React.ReactNode;
  onRowClick?: (row: { original: TestRow }) => void;
  isLoading?: boolean;
}) {
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <DataTable
      table={table}
      emptyState={emptyState}
      onRowClick={onRowClick as Parameters<typeof DataTable>[0]["onRowClick"]}
      isLoading={isLoading}
    />
  );
}

describe("DataTable", () => {
  it("renders column headers", () => {
    render(<TestDataTable />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
  });

  it("renders data rows", () => {
    render(<TestDataTable />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("shows default empty state when no rows", () => {
    render(<TestDataTable data={[]} />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("shows custom empty state", () => {
    render(
      <TestDataTable
        data={[]}
        emptyState={<div>Nothing here yet</div>}
      />
    );
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("calls onRowClick when a row is clicked", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(<TestDataTable onRowClick={onRowClick} />);

    await user.click(screen.getByText("Alice"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0].original).toEqual({
      id: "1",
      name: "Alice",
      age: 30,
    });
  });
});
