import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignsTab } from "@/components/crm/campaigns-tab";

const mockCampaigns = [
  {
    id: "camp-1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    name: "Q1 Outreach",
    description: "First quarter email campaign",
    channel: "email",
    is_active: true,
    meta: {},
    contact_count: 42,
  },
  {
    id: "camp-2",
    created_at: "2024-02-01T00:00:00Z",
    updated_at: "2024-02-01T00:00:00Z",
    name: "LinkedIn Push",
    description: null,
    channel: "linkedin",
    is_active: false,
    meta: {},
    contact_count: 15,
  },
];

const campaignsData = mockCampaigns.map((c) => ({
  ...c,
  contacts: [{ count: c.contact_count }],
}));

const mockFrom = vi.fn().mockImplementation((table: string) => {
  if (table === "campaigns") {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: campaignsData }),
        }),
        order: vi.fn().mockResolvedValue({ data: campaignsData }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "new-1" }, error: null }),
        }),
      }),
    };
  }
  return {
    select: vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [] }),
    }),
  };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  ResponsiveDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

describe("CampaignsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    render(<CampaignsTab />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders campaign list after loading", async () => {
    render(<CampaignsTab />);
    expect(await screen.findByText("Q1 Outreach")).toBeInTheDocument();
    expect(screen.getByText("LinkedIn Push")).toBeInTheDocument();
  });

  it("displays campaign count", async () => {
    render(<CampaignsTab />);
    await screen.findByText("Q1 Outreach");
    expect(screen.getByText("2 campaigns")).toBeInTheDocument();
  });

  it("displays contact counts", async () => {
    render(<CampaignsTab />);
    await screen.findByText("Q1 Outreach");
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("renders New Campaign button", async () => {
    render(<CampaignsTab />);
    await screen.findByText("Q1 Outreach");
    expect(screen.getByText("New Campaign")).toBeInTheDocument();
  });

  it("shows Active and Archived status dots", async () => {
    render(<CampaignsTab />);
    await screen.findByText("Q1 Outreach");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("shows channel info", async () => {
    render(<CampaignsTab />);
    await screen.findByText("Q1 Outreach");
    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("linkedin")).toBeInTheDocument();
  });

  it("shows description for campaigns that have one", async () => {
    render(<CampaignsTab />);
    await screen.findByText("Q1 Outreach");
    expect(screen.getByText("First quarter email campaign")).toBeInTheDocument();
  });

  it("opens form dialog when New Campaign is clicked", async () => {
    const user = userEvent.setup();
    render(<CampaignsTab />);
    await screen.findByText("Q1 Outreach");
    await user.click(screen.getByText("New Campaign"));
    expect(screen.getByPlaceholderText("Name this campaign...")).toBeInTheDocument();
  });

  it("shows empty state when no campaigns exist", async () => {
    mockFrom.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }));
    render(<CampaignsTab />);
    expect(
      await screen.findByText("No campaigns yet. Create one to organize your outreach.")
    ).toBeInTheDocument();
  });
});
