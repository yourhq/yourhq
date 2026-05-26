import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { BriefingSummary } from "@/lib/types/dashboard";

const mockShouldShowBriefing = vi.fn();
const mockGetLastDashboardVisit = vi.fn();
const mockSetLastDashboardVisit = vi.fn();

vi.mock("@/lib/dashboard/last-visit", () => ({
  shouldShowBriefing: () => mockShouldShowBriefing(),
  getLastDashboardVisit: () => mockGetLastDashboardVisit(),
  setLastDashboardVisit: () => mockSetLastDashboardVisit(),
}));

const mockFetchBriefing = vi.fn();
vi.mock("@/app/dashboard/actions/briefing", () => ({
  fetchBriefing: (...args: unknown[]) => mockFetchBriefing(...args),
}));

import { BriefingBar } from "@/app/dashboard/components/briefing-bar";

function buildBriefing(
  overrides: Partial<BriefingSummary> = {},
): BriefingSummary {
  return {
    ownerPreferredName: "Alex",
    since: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    agentUpdates: [
      { agentEmoji: "🔍", agentName: "ResearchBot", taskTitles: ["Research Q2 trends", "Compile competitor analysis", "Draft market report"] },
      { agentEmoji: "✍️", agentName: "WriterBot", taskTitles: ["Write blog post", "Update pricing page"] },
    ],
    deliverablesAwaitingReview: 2,
    failedItems: 0,
    spendSinceUsd: 1.25,
    newContacts: 3,
    skillsLearned: 1,
    ...overrides,
  };
}

describe("BriefingBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when shouldShowBriefing is false", () => {
    mockShouldShowBriefing.mockReturnValue(false);
    mockGetLastDashboardVisit.mockReturnValue(null);
    const { container } = render(<BriefingBar />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when all data is zero", async () => {
    mockShouldShowBriefing.mockReturnValue(true);
    mockGetLastDashboardVisit.mockReturnValue(
      new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    );
    const emptyBriefing = buildBriefing({
      agentUpdates: [],
      deliverablesAwaitingReview: 0,
      failedItems: 0,
      spendSinceUsd: 0,
      newContacts: 0,
      skillsLearned: 0,
    });
    mockFetchBriefing.mockResolvedValue(emptyBriefing);
    const { container } = render(<BriefingBar />);
    await vi.waitFor(() => {
      expect(mockFetchBriefing).toHaveBeenCalled();
    });
    expect(container.querySelector("section")).toBeNull();
  });

  it("renders greeting with owner name", async () => {
    mockShouldShowBriefing.mockReturnValue(true);
    mockGetLastDashboardVisit.mockReturnValue(
      new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    );
    mockFetchBriefing.mockResolvedValue(buildBriefing());
    render(<BriefingBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Alex/)).toBeInTheDocument();
    });
  });

  it("renders agent updates with task titles", async () => {
    mockShouldShowBriefing.mockReturnValue(true);
    mockGetLastDashboardVisit.mockReturnValue(
      new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    );
    mockFetchBriefing.mockResolvedValue(buildBriefing());
    render(<BriefingBar />);
    await vi.waitFor(() => {
      expect(screen.getByText("ResearchBot")).toBeInTheDocument();
      expect(screen.getByText("WriterBot")).toBeInTheDocument();
    });
  });

  it("dismisses on X button click", async () => {
    mockShouldShowBriefing.mockReturnValue(true);
    mockGetLastDashboardVisit.mockReturnValue(
      new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    );
    mockFetchBriefing.mockResolvedValue(buildBriefing());
    const { container } = render(<BriefingBar />);
    await vi.waitFor(() => {
      expect(screen.getByText(/Alex/)).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole("button");
    fireEvent.click(dismissBtn);

    expect(container.querySelector("section")).toBeNull();
  });

  it("calls setLastDashboardVisit after fetch", async () => {
    mockShouldShowBriefing.mockReturnValue(true);
    mockGetLastDashboardVisit.mockReturnValue(
      new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    );
    mockFetchBriefing.mockResolvedValue(buildBriefing());
    render(<BriefingBar />);
    await vi.waitFor(() => {
      expect(mockSetLastDashboardVisit).toHaveBeenCalled();
    });
  });
});
