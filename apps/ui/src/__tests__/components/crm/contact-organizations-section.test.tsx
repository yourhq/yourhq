import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactOrganizationsSection } from "@/components/crm/contact-organizations-section";

const mockAddLink = vi.fn().mockResolvedValue({ error: null });
const mockRemoveLink = vi.fn().mockResolvedValue(undefined);
const mockSearchOrganizations = vi.fn().mockResolvedValue([]);

vi.mock("@/hooks/use-contact-organizations", () => ({
  useContactOrganizations: () => ({
    links: [
      {
        id: "link-1",
        org_id: "org-1",
        contact_id: "c-1",
        role: "CTO",
        is_current: true,
        organization: { id: "org-1", name: "Acme Corp", industry: "Tech" },
      },
      {
        id: "link-2",
        org_id: "org-2",
        contact_id: "c-1",
        role: null,
        is_current: false,
        organization: { id: "org-2", name: "Old Inc", industry: null },
      },
    ],
    loading: false,
    addLink: mockAddLink,
    removeLink: mockRemoveLink,
    searchOrganizations: mockSearchOrganizations,
  }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

describe("ContactOrganizationsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Organizations heading", () => {
    render(<ContactOrganizationsSection contactId="c-1" />);
    expect(screen.getByText("Organizations")).toBeInTheDocument();
  });

  it("renders linked organizations", () => {
    render(<ContactOrganizationsSection contactId="c-1" />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Old Inc")).toBeInTheDocument();
  });

  it("renders role badge for links with roles", () => {
    render(<ContactOrganizationsSection contactId="c-1" />);
    expect(screen.getByText("CTO")).toBeInTheDocument();
  });

  it("renders Former label for non-current links", () => {
    render(<ContactOrganizationsSection contactId="c-1" />);
    expect(screen.getByText("Former")).toBeInTheDocument();
  });

  it("shows search input when plus button is clicked", async () => {
    const user = userEvent.setup();
    render(<ContactOrganizationsSection contactId="c-1" />);
    await user.click(screen.getByTitle("Link organization"));
    expect(screen.getByPlaceholderText("Search organizations...")).toBeInTheDocument();
  });

  it("hides search input when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<ContactOrganizationsSection contactId="c-1" />);
    await user.click(screen.getByTitle("Link organization"));
    expect(screen.getByPlaceholderText("Search organizations...")).toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button");
    const closeBtn = closeButtons.find((btn) => btn.querySelector("[class*='lucide-x']"));
    if (closeBtn) await user.click(closeBtn);
    expect(screen.queryByPlaceholderText("Search organizations...")).not.toBeInTheDocument();
  });

  it("shows organization links with href", () => {
    render(<ContactOrganizationsSection contactId="c-1" />);
    const link = screen.getByText("Acme Corp").closest("a");
    expect(link).toHaveAttribute("href", "/dashboard/organizations/org-1");
  });

  it("renders the add organization button", () => {
    render(<ContactOrganizationsSection contactId="c-1" />);
    expect(screen.getByTitle("Link organization")).toBeInTheDocument();
  });
});
