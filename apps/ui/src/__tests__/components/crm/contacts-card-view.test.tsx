import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactsCardView } from "@/components/crm/contacts-card-view";
import type { Contact } from "@/lib/crm/types";

vi.mock("@/hooks/use-pipeline-stages", () => ({
  usePipelineStages: () => ({
    stages: [
      { stage_key: "lead", label: "Lead", color: "#3b82f6", sort_order: 0 },
      { stage_key: "prospect", label: "Prospect", color: "#22c55e", sort_order: 1 },
    ],
    stagesByKey: {
      lead: { stage_key: "lead", label: "Lead", color: "#3b82f6" },
      prospect: { stage_key: "prospect", label: "Prospect", color: "#22c55e" },
    },
    defaultStage: null,
    loading: false,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: `c-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: "Test Contact",
    email: "test@example.com",
    phone: null,
    linkedin_url: null,
    twitter_url: null,
    website_url: null,
    company: null,
    title: null,
    location: null,
    avatar_url: null,
    how_we_met: null,
    notes: null,
    tags: [],
    status: "lead",
    status_changed_at: null,
    priority: null,
    relationship_strength: "stranger",
    last_contact_date: null,
    source: null,
    extended: {},
    archived_at: null,
    campaign_id: null,
    ...overrides,
  };
}

const defaultProps = {
  contacts: [] as Contact[],
  loading: false,
  hasFilters: false,
  onSelect: vi.fn(),
  onEdit: vi.fn(),
  onStatusChange: vi.fn(),
  onArchive: vi.fn(),
  onRestore: vi.fn(),
  onDelete: vi.fn(),
  showArchived: false,
  onClearFilters: vi.fn(),
  onAddContact: vi.fn(),
};

describe("ContactsCardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders loading skeleton when loading is true", () => {
    const { container } = render(
      <ContactsCardView {...defaultProps} loading={true} />
    );
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders empty state when no contacts and no filters", () => {
    render(<ContactsCardView {...defaultProps} contacts={[]} />);
    expect(screen.getByText("No contacts yet")).toBeInTheDocument();
    expect(screen.getByText("Add contact")).toBeInTheDocument();
  });

  it("renders filtered empty state when no contacts but has filters", () => {
    render(<ContactsCardView {...defaultProps} contacts={[]} hasFilters={true} />);
    expect(screen.getByText("No contacts match your filters")).toBeInTheDocument();
    expect(screen.getByText("Clear filters")).toBeInTheDocument();
  });

  it("renders contact cards when data exists", () => {
    const contacts = [
      makeContact({ name: "Alice Smith", status: "lead" }),
      makeContact({ name: "Bob Jones", status: "prospect" }),
    ];
    render(<ContactsCardView {...defaultProps} contacts={contacts} />);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  });

  it("renders contact subtitle with title and company", () => {
    const contacts = [
      makeContact({ name: "Alice", title: "Engineer", company: "TechCo" }),
    ];
    render(<ContactsCardView {...defaultProps} contacts={contacts} />);
    expect(screen.getByText("Engineer · TechCo")).toBeInTheDocument();
  });

  it("renders email as subtitle fallback when no title or company", () => {
    const contacts = [
      makeContact({ name: "Alice", email: "alice@test.com", title: null, company: null }),
    ];
    render(<ContactsCardView {...defaultProps} contacts={contacts} />);
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
  });

  it("renders priority indicator", () => {
    const contacts = [
      makeContact({ name: "Alice", priority: "urgent" }),
    ];
    render(<ContactsCardView {...defaultProps} contacts={contacts} />);
    expect(screen.getByText("urgent")).toBeInTheDocument();
  });

  it("renders pipeline stage label", () => {
    const contacts = [
      makeContact({ name: "Alice", status: "lead" }),
    ];
    render(<ContactsCardView {...defaultProps} contacts={contacts} />);
    expect(screen.getByText("Lead")).toBeInTheDocument();
  });

  it("renders tags on contact cards", () => {
    const contacts = [
      makeContact({ name: "Alice", tags: ["vip", "investor"] }),
    ];
    render(<ContactsCardView {...defaultProps} contacts={contacts} />);
    expect(screen.getByText("vip")).toBeInTheDocument();
    expect(screen.getByText("investor")).toBeInTheDocument();
  });

  it("truncates tags beyond 3 and shows overflow count", () => {
    const contacts = [
      makeContact({ name: "Alice", tags: ["a", "b", "c", "d", "e"] }),
    ];
    render(<ContactsCardView {...defaultProps} contacts={contacts} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("calls onSelect when card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const contacts = [makeContact({ name: "Alice" })];
    render(<ContactsCardView {...defaultProps} contacts={contacts} onSelect={onSelect} />);
    await user.click(screen.getByText("Alice"));
    expect(onSelect).toHaveBeenCalledWith(contacts[0]);
  });

  it("calls onAddContact from empty state action button", async () => {
    const user = userEvent.setup();
    const onAddContact = vi.fn();
    render(<ContactsCardView {...defaultProps} contacts={[]} onAddContact={onAddContact} />);
    await user.click(screen.getByText("Add contact"));
    expect(onAddContact).toHaveBeenCalled();
  });

  it("calls onClearFilters from filtered empty state", async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(
      <ContactsCardView
        {...defaultProps}
        contacts={[]}
        hasFilters={true}
        onClearFilters={onClearFilters}
      />
    );
    await user.click(screen.getByText("Clear filters"));
    expect(onClearFilters).toHaveBeenCalled();
  });
});
