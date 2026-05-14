import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactDetailView } from "@/components/crm/contact-detail-view";
import type { Contact } from "@/lib/crm/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

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
    getStageColor: (key: string) => (key === "lead" ? "#3b82f6" : "#22c55e"),
    getStageLabel: (key: string) => (key === "lead" ? "Lead" : "Prospect"),
  }),
}));

vi.mock("@/hooks/use-field-definitions", () => ({
  useFieldDefinitions: () => ({
    fields: [],
    groupedFields: [],
    loading: false,
  }),
}));

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const mockDelete = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const mockFrom = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [] }),
    }),
  }),
  update: mockUpdate,
  delete: mockDelete,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/components/crm/interactions-timeline", () => ({
  InteractionsTimeline: () => <div data-testid="interactions-timeline" />,
}));

vi.mock("@/components/crm/draft-sets-section", () => ({
  DraftSetsSection: () => <div data-testid="draft-sets-section" />,
}));

vi.mock("@/components/crm/contact-organizations-section", () => ({
  ContactOrganizationsSection: () => <div data-testid="contact-orgs-section" />,
}));

vi.mock("@/components/inbox/contact-inbox-history", () => ({
  ContactInboxHistory: () => <div data-testid="inbox-history" />,
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
    confirmLabel,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel: string;
    description?: string;
    tone?: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/shared/pipeline-stage-picker", () => ({
  PipelineStagePicker: ({
    value,
    onValueChange,
  }: {
    entityType: string;
    value: string;
    onValueChange: (v: string) => void;
    triggerClassName?: string;
  }) => (
    <button data-testid="pipeline-picker" onClick={() => onValueChange("prospect")}>
      {value}
    </button>
  ),
}));

vi.mock("@/components/shared/dynamic-field-group", () => ({
  DynamicFieldGroups: () => <div data-testid="dynamic-fields" />,
}));

function buildContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-1",
    created_at: "2024-01-15T00:00:00Z",
    updated_at: "2024-06-20T00:00:00Z",
    name: "Alice Johnson",
    email: "alice@example.com",
    phone: "+1 555 123 4567",
    linkedin_url: "https://linkedin.com/in/alice",
    twitter_url: null,
    website_url: null,
    company: "Acme Corp",
    title: "CTO",
    location: "San Francisco",
    avatar_url: null,
    how_we_met: null,
    notes: "Important meeting notes",
    tags: ["investor", "advisor"],
    status: "lead",
    status_changed_at: null,
    priority: "high",
    relationship_strength: "warm",
    last_contact_date: "2024-06-01T00:00:00Z",
    source: null,
    extended: {},
    archived_at: null,
    campaign_id: null,
    ...overrides,
  };
}

describe("ContactDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders contact name in breadcrumb and title", () => {
    render(<ContactDetailView contact={buildContact()} />);
    const nameElements = screen.getAllByText("Alice Johnson");
    expect(nameElements.length).toBe(2);
  });

  it("renders breadcrumbs with CRM link", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("CRM")).toBeInTheDocument();
    const link = screen.getByText("CRM").closest("a");
    expect(link).toHaveAttribute("href", "/dashboard/crm");
  });

  it("renders email field", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("renders phone field", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("+1 555 123 4567")).toBeInTheDocument();
  });

  it("renders company field", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("renders title field", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("CTO")).toBeInTheDocument();
  });

  it("renders location field", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("San Francisco")).toBeInTheDocument();
  });

  it("renders section headings", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("renders tags", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("investor")).toBeInTheDocument();
    expect(screen.getByText("advisor")).toBeInTheDocument();
  });

  it("renders notes textarea with content", () => {
    render(<ContactDetailView contact={buildContact()} />);
    const textarea = screen.getByPlaceholderText("Anything worth remembering...");
    expect(textarea).toHaveValue("Important meeting notes");
  });

  it("renders sidebar labels", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
    expect(screen.getByText("Relationship")).toBeInTheDocument();
    expect(screen.getByText("Campaign")).toBeInTheDocument();
  });

  it("renders metadata labels", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
  });

  it("renders last contact label when date present", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("Last contact")).toBeInTheDocument();
  });

  it("does not render last contact date when absent", () => {
    render(<ContactDetailView contact={buildContact({ last_contact_date: null })} />);
    expect(screen.queryByText("Last contact")).not.toBeInTheDocument();
  });

  it("renders sub-components", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByTestId("interactions-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("draft-sets-section")).toBeInTheDocument();
    expect(screen.getByTestId("contact-orgs-section")).toBeInTheDocument();
    expect(screen.getByTestId("inbox-history")).toBeInTheDocument();
  });

  it("shows settings link when no custom fields defined", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("+ Add custom properties in Settings")).toBeInTheDocument();
  });

  it("shows archive confirm dialog when archive button is clicked", async () => {
    const user = userEvent.setup();
    render(<ContactDetailView contact={buildContact()} />);
    await user.click(screen.getByTitle("Archive"));
    expect(screen.getByText("Archive Alice Johnson?")).toBeInTheDocument();
  });

  it("shows delete confirm dialog when delete button is clicked", async () => {
    const user = userEvent.setup();
    render(<ContactDetailView contact={buildContact()} />);
    await user.click(screen.getByTitle("Delete"));
    expect(screen.getByText("Delete Alice Johnson?")).toBeInTheDocument();
  });

  it("renders pipeline stage picker", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByTestId("pipeline-picker")).toBeInTheDocument();
  });

  it("renders linkedin URL", () => {
    render(<ContactDetailView contact={buildContact()} />);
    expect(screen.getByText("linkedin.com/in/alice")).toBeInTheDocument();
  });
});
