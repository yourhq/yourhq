import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockDismiss = vi.fn();
let mockProgress = {
  wizardCompleted: true,
  dismissedAt: null as string | null,
  pagesVisited: [] as string[],
  microTipsSeen: [] as string[],
  tier1: {
    agentCreated: false,
    channelConnected: false,
    taskAssigned: false,
    agentWorked: false,
    knowledgeCreated: false,
    dashboardExplored: false,
  },
  tier2: {
    sourceConnected: false,
    routineCreated: false,
    desktopViewed: false,
    secondAgentCreated: false,
  },
};

vi.mock("@/hooks/use-onboarding-progress", () => ({
  useOnboardingProgress: () => ({
    progress: mockProgress,
    dismiss: mockDismiss,
    isTier1Done: Object.values(mockProgress.tier1).every(Boolean),
  }),
}));

vi.mock("@/lib/onboarding/progress", () => ({
  tier1Count: (p: typeof mockProgress) => {
    const vals = Object.values(p.tier1);
    return { done: vals.filter(Boolean).length, total: vals.length };
  },
  tier2Count: (p: typeof mockProgress) => {
    const vals = Object.values(p.tier2);
    return { done: vals.filter(Boolean).length, total: vals.length };
  },
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

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

vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div>{children}</div>,
}));

import { MissionPanel } from "@/components/onboarding/mission-panel";

describe("MissionPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgress = {
      wizardCompleted: true,
      dismissedAt: null,
      pagesVisited: [],
      microTipsSeen: [],
      tier1: {
        agentCreated: false,
        channelConnected: false,
        taskAssigned: false,
        agentWorked: false,
        knowledgeCreated: false,
        dashboardExplored: false,
      },
      tier2: {
        sourceConnected: false,
        routineCreated: false,
        desktopViewed: false,
        secondAgentCreated: false,
      },
    };
  });

  it("renders getting started heading for tier 1", () => {
    render(<MissionPanel />);
    const headings = screen.getAllByText("Getting started");
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  it("renders tier 1 mission items", () => {
    render(<MissionPanel />);
    expect(screen.getAllByText("Create your first agent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Connect a channel").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Assign a task to an agent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Add knowledge").length).toBeGreaterThanOrEqual(1);
  });

  it("shows 0/6 count for empty tier 1", () => {
    render(<MissionPanel />);
    const counters = screen.getAllByText("0/6");
    expect(counters.length).toBeGreaterThanOrEqual(1);
  });

  it("shows correct count when some items are done", () => {
    mockProgress.tier1.agentCreated = true;
    mockProgress.tier1.knowledgeCreated = true;
    render(<MissionPanel />);
    const counters = screen.getAllByText("2/6");
    expect(counters.length).toBeGreaterThanOrEqual(1);
  });

  it("returns null when wizard is not completed", () => {
    mockProgress.wizardCompleted = false;
    const { container } = render(<MissionPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("returns null when progress is dismissed", () => {
    mockProgress.dismissedAt = "2025-01-01";
    const { container } = render(<MissionPanel />);
    expect(container.innerHTML).toBe("");
  });

  it("renders dismiss button with X icon", () => {
    render(<MissionPanel />);
    const dismissButtons = screen.getAllByRole("button", {
      name: "Dismiss getting started",
    });
    expect(dismissButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls dismiss when X button is clicked", async () => {
    const user = userEvent.setup();
    render(<MissionPanel />);
    const dismissButtons = screen.getAllByRole("button", {
      name: "Dismiss getting started",
    });
    await user.click(dismissButtons[0]);
    expect(mockDismiss).toHaveBeenCalled();
  });

  it("renders Don’t show again button", () => {
    render(<MissionPanel />);
    const buttons = screen.getAllByText(/Don.t show again/);
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("calls dismiss when Don’t show again is clicked", async () => {
    const user = userEvent.setup();
    render(<MissionPanel />);
    const buttons = screen.getAllByText(/Don.t show again/);
    await user.click(buttons[0]);
    expect(mockDismiss).toHaveBeenCalled();
  });

  it("renders links for incomplete items", () => {
    render(<MissionPanel />);
    const agentLinks = screen.getAllByRole("link", {
      name: "Go to Create your first agent",
    });
    expect(agentLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("renders minimize button", () => {
    render(<MissionPanel />);
    expect(screen.getByText("Minimize")).toBeInTheDocument();
  });

  it("shows tier 2 items when all tier 1 items are done", () => {
    mockProgress.tier1 = {
      agentCreated: true,
      channelConnected: true,
      taskAssigned: true,
      agentWorked: true,
      knowledgeCreated: true,
      dashboardExplored: true,
    };
    render(<MissionPanel />);
    const headings = screen.getAllByText("Go further");
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Connect a source").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Create a routine").length).toBeGreaterThanOrEqual(1);
  });

  it("returns null when both tier 1 and tier 2 are complete", () => {
    mockProgress.tier1 = {
      agentCreated: true,
      channelConnected: true,
      taskAssigned: true,
      agentWorked: true,
      knowledgeCreated: true,
      dashboardExplored: true,
    };
    mockProgress.tier2 = {
      sourceConnected: true,
      routineCreated: true,
      desktopViewed: true,
      secondAgentCreated: true,
    };
    const { container } = render(<MissionPanel />);
    expect(container.innerHTML).toBe("");
  });
});
