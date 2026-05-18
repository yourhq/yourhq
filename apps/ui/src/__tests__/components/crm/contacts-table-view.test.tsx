import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContactsTableView } from "@/components/crm/contacts-table-view";
import type { Contact } from "@/lib/crm/types";
import type { SortingState } from "@tanstack/react-table";

vi.mock("@/hooks/use-pipeline-stages", () => ({
  usePipelineStages: () => ({
    stages: [
      { stage_key: "lead", label: "Lead", color: "#3b82f6", is_terminal: false, sort_order: 0 },
      { stage_key: "prospect", label: "Prospect", color: "#22c55e", is_terminal: false, sort_order: 1 },
    ],
    stagesByKey: {
      lead: { stage_key: "lead", label: "Lead", color: "#3b82f6" },
      prospect: { stage_key: "prospect", label: "Prospect", color: "#22c55e" },
    },
    defaultStage: null,
    loading: false,
  }),
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({
    fields: [],
    groupedFields: [],
    loading: false,
  }),
}));

vi.mock("@/hooks/use-column-visibility", () => ({
  useColumnVisibility: () => ({
    columnVisibility: {},
    toggleColumn: vi.fn(),
    resetToDefaults: vi.fn(),
    toggleItems: [],
  }),
}));

vi.mock("@/lib/columns/contact-columns", () => ({
  getContactColumnConfigs: () => [
    {
      id: "name",
      label: "Contact",
      defaultVisible: true,
      columnDef: {
        accessorKey: "name",
        header: "Contact",
        cell: ({ row }: { row: { original: Contact } }) => row.original.name,
      },
    },
    {
      id: "company",
      label: "Company",
      defaultVisible: true,
      columnDef: {
        accessorKey: "company",
        header: "Company",
        cell: ({ row }: { row: { original: Contact } }) => row.original.company ?? "—",
      },
    },
    {
      id: "actions",
      label: "",
      defaultVisible: true,
      columnDef: {
        id: "actions",
        header: "",
        cell: () => null,
      },
    },
  ],
}));

vi.mock("@/lib/columns/extended-columns", () => ({
  buildExtendedColumnConfigs: () => [],
}));

vi.mock("@/components/shared/data-table", () => ({
  DataTable: ({ table, onRowClick }: { table: { getRowModel: () => { rows: { id: string; original: Contact; getVisibleCells: () => { id: string; column: { columnDef: { cell: unknown } }; getContext: () => unknown }[] }[] } }; onRowClick?: (row: { original: Contact }) => void }) => {
    const rows = table.getRowModel().rows;
    return (
      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} onClick={() => onRowClick?.({ original: row.original })}>
              <td>{row.original.name}</td>
              <td>{row.original.company}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock("@/components/crm/contacts-empty", () => ({
  ContactsEmpty: () => <div data-testid="contacts-empty">No contacts</div>,
}));

vi.mock("@/components/crm/bulk-action-bar", () => ({
  BulkActionBar: () => <div data-testid="bulk-action-bar" />,
}));

function buildContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: "Alice Johnson",
    email: "alice@example.com",
    phone: null,
    linkedin_url: null,
    twitter_url: null,
    website_url: null,
    company: "Acme Corp",
    title: "CTO",
    location: null,
    avatar_url: null,
    how_we_met: null,
    notes: null,
    tags: [],
    status: "lead",
    status_changed_at: null,
    priority: null,
    relationship_strength: "warm",
    last_contact_date: null,
    source: null,
    extended: {},
    archived_at: null,
    campaign_id: null,
    ...overrides,
  };
}

describe("ContactsTableView", () => {
  let handlers: Record<string, ReturnType<typeof vi.fn>>;
  const sorting: SortingState = [];

  beforeEach(() => {
    handlers = {
      onSortingChange: vi.fn(),
      onSelect: vi.fn(),
      onStatusChange: vi.fn(),
      onArchive: vi.fn(),
      onRestore: vi.fn(),
      onDelete: vi.fn(),
      onBulkArchive: vi.fn(),
      onBulkDelete: vi.fn(),
      onBulkStatusChange: vi.fn(),
      onClearFilters: vi.fn(),
      onAddContact: vi.fn(),
    };
  });

  function renderTable(contacts: Contact[] = [], overrides: Record<string, unknown> = {}) {
    return render(
      <ContactsTableView
        contacts={contacts}
        loading={false}
        hasFilters={false}
        sorting={sorting}
        onSortingChange={handlers.onSortingChange}
        onSelect={handlers.onSelect}
        onStatusChange={handlers.onStatusChange}
        onArchive={handlers.onArchive}
        onRestore={handlers.onRestore}
        onDelete={handlers.onDelete}
        onBulkArchive={handlers.onBulkArchive}
        onBulkDelete={handlers.onBulkDelete}
        onBulkStatusChange={handlers.onBulkStatusChange}
        showArchived={false}
        onClearFilters={handlers.onClearFilters}
        onAddContact={handlers.onAddContact}
        {...overrides}
      />
    );
  }

  it("renders empty state when no contacts and not loading", () => {
    renderTable([]);
    expect(screen.getByTestId("contacts-empty")).toBeInTheDocument();
  });

  it("renders contact rows", () => {
    const contacts = [
      buildContact({ id: "c-1", name: "Alice", company: "Acme" }),
      buildContact({ id: "c-2", name: "Bob", company: "Beta Inc" }),
    ];
    renderTable(contacts);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders company column", () => {
    renderTable([buildContact({ company: "Acme Corp" })]);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("renders bulk action bar", () => {
    renderTable([buildContact()]);
    expect(screen.getByTestId("bulk-action-bar")).toBeInTheDocument();
  });
});
