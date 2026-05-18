import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Organization } from "@/lib/organizations/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/hooks/use-pipeline-stages", () => ({
  usePipelineStages: () => ({
    stages: [],
    stagesByKey: {},
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

vi.mock("@/lib/columns/org-columns", () => ({
  getOrgColumnConfigs: () => [],
}));

vi.mock("@/lib/columns/extended-columns", () => ({
  buildExtendedColumnConfigs: () => [],
}));

vi.mock("@/components/shared/data-table", () => ({
  DataTable: () => <div data-testid="data-table">Table</div>,
}));

import { OrgList } from "@/components/organizations/org-list";

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    name: "Acme Corp",
    type: "company",
    website: "https://acme.com",
    industry: "Fintech",
    size: "51-200",
    location: "San Francisco",
    description: "A fintech company",
    notes: null,
    tags: ["partner"],
    status: "lead",
    extended: {},
    archived_at: null,
    ...overrides,
  };
}

describe("OrgList", () => {
  afterEach(() => cleanup());

  it("shows empty state when no organizations and no filters", () => {
    render(
      <OrgList
        organizations={[]}
        loading={false}
        hasFilters={false}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        showArchived={false}
        onClearFilters={vi.fn()}
        onAddOrg={vi.fn()}
      />
    );
    expect(screen.getByText("No organizations yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Add your first organization/)
    ).toBeInTheDocument();
  });

  it("shows filtered empty state when no orgs match filters", () => {
    render(
      <OrgList
        organizations={[]}
        loading={false}
        hasFilters={true}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        showArchived={false}
        onClearFilters={vi.fn()}
        onAddOrg={vi.fn()}
      />
    );
    expect(
      screen.getByText("No organizations match your filters")
    ).toBeInTheDocument();
  });

  it("renders data table when organizations exist", () => {
    render(
      <OrgList
        organizations={[makeOrg()]}
        loading={false}
        hasFilters={false}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        showArchived={false}
        onClearFilters={vi.fn()}
        onAddOrg={vi.fn()}
      />
    );
    expect(screen.getByTestId("data-table")).toBeInTheDocument();
  });

  it("renders 'Add organization' action in empty state", () => {
    const onAddOrg = vi.fn();
    render(
      <OrgList
        organizations={[]}
        loading={false}
        hasFilters={false}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onRestore={vi.fn()}
        onDelete={vi.fn()}
        showArchived={false}
        onClearFilters={vi.fn()}
        onAddOrg={onAddOrg}
      />
    );
    expect(
      screen.getByText("Add organization")
    ).toBeInTheDocument();
  });
});
