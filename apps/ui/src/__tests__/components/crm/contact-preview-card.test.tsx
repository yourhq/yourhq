import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactPreviewCard } from "@/components/crm/contact-preview-card";
import type { Contact } from "@/lib/crm/types";

vi.mock("@/hooks/use-pipeline-stages", () => ({
  usePipelineStages: () => ({
    stagesByKey: {
      lead: { stage_key: "lead", label: "Lead", color: "#3b82f6", is_terminal: false },
      prospect: { stage_key: "prospect", label: "Prospect", color: "#22c55e", is_terminal: false },
    },
    stages: [],
    defaultStage: null,
    loading: false,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

function buildFullContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: "Alice Johnson",
    email: "alice@example.com",
    phone: "+1 555 123 4567",
    linkedin_url: "https://linkedin.com/in/alice",
    twitter_url: "https://x.com/alice",
    website_url: "https://alice.dev",
    company: "Acme Corp",
    title: "CTO",
    location: "San Francisco",
    avatar_url: null,
    how_we_met: null,
    notes: "Met at SaaStr conference",
    tags: ["investor", "advisor", "fintech"],
    status: "lead",
    status_changed_at: null,
    priority: "high",
    relationship_strength: "warm",
    last_contact_date: null,
    source: null,
    extended: {},
    archived_at: null,
    campaign_id: null,
    ...overrides,
  };
}

describe("ContactPreviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders contact name", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
  });

  it("renders email with mailto link", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    const emailLink = screen.getByText("alice@example.com");
    expect(emailLink).toBeInTheDocument();
    expect(emailLink.closest("a")).toHaveAttribute("href", "mailto:alice@example.com");
  });

  it("renders phone number", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    expect(screen.getByText("+1 555 123 4567")).toBeInTheDocument();
  });

  it("renders company and title", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("CTO")).toBeInTheDocument();
  });

  it("renders location", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    expect(screen.getByText("San Francisco")).toBeInTheDocument();
  });

  it("renders priority indicator", () => {
    render(<ContactPreviewCard contact={buildFullContact({ priority: "high" })} />);
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("renders pipeline stage via StatusDot when no onStatusChange", () => {
    render(<ContactPreviewCard contact={buildFullContact({ status: "lead" })} />);
    expect(screen.getByText("Lead")).toBeInTheDocument();
  });

  it("handles missing optional fields gracefully", () => {
    const contact = buildFullContact({
      email: null,
      phone: null,
      company: null,
      title: null,
      location: null,
      linkedin_url: null,
      twitter_url: null,
      website_url: null,
      priority: null,
      notes: null,
      tags: [],
    });
    render(<ContactPreviewCard contact={contact} />);
    expect(screen.getByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.queryByText("alice@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("+1 555 123 4567")).not.toBeInTheDocument();
  });

  it("renders social links when URLs are present", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
    expect(screen.getByText("Twitter/X")).toBeInTheDocument();
    expect(screen.getByText("Website")).toBeInTheDocument();
  });

  it("does not render social links when URLs are null", () => {
    const contact = buildFullContact({
      linkedin_url: null,
      twitter_url: null,
      website_url: null,
    });
    render(<ContactPreviewCard contact={contact} />);
    expect(screen.queryByText("LinkedIn")).not.toBeInTheDocument();
    expect(screen.queryByText("Twitter/X")).not.toBeInTheDocument();
    expect(screen.queryByText("Website")).not.toBeInTheDocument();
  });

  it("renders tags", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    expect(screen.getByText("investor")).toBeInTheDocument();
    expect(screen.getByText("advisor")).toBeInTheDocument();
    expect(screen.getByText("fintech")).toBeInTheDocument();
  });

  it("truncates tags beyond 6 and shows overflow count", () => {
    const contact = buildFullContact({
      tags: ["a", "b", "c", "d", "e", "f", "g", "h"],
    });
    render(<ContactPreviewCard contact={contact} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders notes preview", () => {
    render(<ContactPreviewCard contact={buildFullContact({ notes: "Important notes here" })} />);
    expect(screen.getByText("Important notes here")).toBeInTheDocument();
  });

  it("calls onArchive when archive button is clicked", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<ContactPreviewCard contact={buildFullContact()} onArchive={onArchive} />);
    const archiveButton = screen.getByRole("button");
    await user.click(archiveButton);
    expect(onArchive).toHaveBeenCalledWith("c-1");
  });

  it("does not render archive button when onArchive is not provided", () => {
    render(<ContactPreviewCard contact={buildFullContact()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders subtitle with title and company separated by dot", () => {
    render(<ContactPreviewCard contact={buildFullContact({ title: "CEO", company: "BigCo" })} />);
    const subtitleEl = screen.getByText((_, element) => {
      return element?.textContent === "CEO · BigCo";
    });
    expect(subtitleEl).toBeInTheDocument();
  });
});
