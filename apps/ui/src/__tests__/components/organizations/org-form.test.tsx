import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
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

vi.mock("@/components/shared/side-panel", () => ({
  SidePanel: ({
    open,
    children,
    footer,
    onClose: _onClose,
  }: {
    open: boolean;
    children: React.ReactNode;
    footer: React.ReactNode;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="side-panel">
        {children}
        <div data-testid="side-panel-footer">{footer}</div>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/tag-input", () => ({
  TagInput: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="tag-input">{placeholder}</div>
  ),
}));

import { OrgForm } from "@/components/organizations/org-form";

beforeEach(() => {
  mockSupabase = createMockSupabaseClient();
});

afterEach(() => cleanup());

describe("OrgForm", () => {
  it("renders form fields when open", () => {
    render(
      <OrgForm open={true} onClose={vi.fn()} organization={null} onSaved={vi.fn()} />
    );
    expect(screen.getByPlaceholderText("What's the organization name?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Fintech")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("San Francisco, CA")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <OrgForm open={false} onClose={vi.fn()} organization={null} onSaved={vi.fn()} />
    );
    expect(screen.queryByTestId("side-panel")).not.toBeInTheDocument();
  });

  it("populates fields in edit mode", () => {
    const org = buildOrganization({
      name: "Acme Corp",
      website: "https://acme.com",
      industry: "Fintech",
      location: "SF",
    });
    render(
      <OrgForm open={true} onClose={vi.fn()} organization={org as never} onSaved={vi.fn()} />
    );
    expect(screen.getByDisplayValue("Acme Corp")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://acme.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Fintech")).toBeInTheDocument();
    expect(screen.getByDisplayValue("SF")).toBeInTheDocument();
  });

  it("disables Create button when name is empty", () => {
    render(
      <OrgForm open={true} onClose={vi.fn()} organization={null} onSaved={vi.fn()} />
    );
    const createBtn = screen.getByRole("button", { name: "Create" });
    expect(createBtn).toBeDisabled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <OrgForm open={true} onClose={onClose} organization={null} onSaved={vi.fn()} />
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onSaved after successful submission", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    mockSupabase = createMockSupabaseClient({
      tables: new Map([
        ["organizations", {
          insert: { data: [{ id: "org-new" }], error: null },
        }],
      ]),
    });

    render(
      <OrgForm open={true} onClose={vi.fn()} organization={null} onSaved={onSaved} />
    );

    await user.type(screen.getByPlaceholderText("What's the organization name?"), "New Org");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });
});
