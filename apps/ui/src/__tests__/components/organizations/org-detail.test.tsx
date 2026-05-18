import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildOrganization } from "@/__tests__/helpers/factories/organization";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";

let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({
    fields: [],
    groupedFields: [],
    addField: vi.fn(),
    updateField: vi.fn(),
    deleteField: vi.fn(),
    reorderFields: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/components/shared/property-list", () => ({
  PropertyList: () => <div data-testid="property-list" />,
}));

vi.mock("@/components/shared/pipeline-stage-picker", () => ({
  PipelineStagePicker: () => <div data-testid="pipeline-stage-picker" />,
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/crm/interactions-timeline", () => ({
  InteractionsTimeline: () => <div data-testid="interactions-timeline" />,
}));

vi.mock("./org-form", () => ({
  OrgForm: ({ open }: { open: boolean }) =>
    open ? <div data-testid="org-form">OrgForm</div> : null,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { OrgDetail } from "@/components/organizations/org-detail";

afterEach(() => cleanup());

function renderOrgDetail(overrides: Record<string, unknown> = {}) {
  mockSupabase = createMockSupabaseClient();
  const org = buildOrganization({
    name: "Acme Corp",
    type: "company",
    industry: "Fintech",
    website: "https://acme.com",
    location: "San Francisco",
    description: "A fintech company",
    size: "51-200",
    tags: ["partner", "enterprise"],
    ...overrides,
  });
  return render(<OrgDetail organization={org as never} />);
}

describe("OrgDetail", () => {
  it("renders org name", () => {
    renderOrgDetail();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("shows detail fields", () => {
    renderOrgDetail();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Fintech")).toBeInTheDocument();
    expect(screen.getByText("San Francisco")).toBeInTheDocument();
  });

  it("shows Edit button", () => {
    renderOrgDetail();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("shows Delete button that opens confirmation", async () => {
    const user = userEvent.setup();
    renderOrgDetail();
    await user.click(screen.getByText("Delete"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Delete Acme Corp/)).toBeInTheDocument();
  });

  it("shows description when provided", () => {
    renderOrgDetail();
    expect(screen.getByText("A fintech company")).toBeInTheDocument();
  });

  it("shows empty people message in People tab", async () => {
    const user = userEvent.setup();
    renderOrgDetail();
    await user.click(screen.getByText("People"));
    await waitFor(() => {
      expect(screen.getByText("No people linked to this organization yet.")).toBeInTheDocument();
    });
  });
});
