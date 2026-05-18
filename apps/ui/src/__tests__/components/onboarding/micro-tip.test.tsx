import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockMarkTipSeen = vi.fn();
const mockProgress = {
  wizardCompleted: true,
  dismissedAt: null,
  pagesVisited: [],
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
    markTipSeen: mockMarkTipSeen,
  }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { MicroTip } from "@/components/onboarding/micro-tip";

describe("MicroTip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockProgress.wizardCompleted = true;
    mockProgress.dismissedAt = null;
    mockProgress.microTipsSeen = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders children", () => {
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <button>Click me</button>
      </MicroTip>,
    );
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("does not show tooltip initially", () => {
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows tooltip after 600ms delay", () => {
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Helpful tip")).toBeInTheDocument();
  });

  it("auto-dismisses after 12 seconds and calls markTipSeen", () => {
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(12000);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(mockMarkTipSeen).toHaveBeenCalledWith("tip1");
  });

  it("dismisses on click and calls markTipSeen", async () => {
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole("tooltip"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(mockMarkTipSeen).toHaveBeenCalledWith("tip1");
  });

  it("dismisses on Escape key", () => {
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(mockMarkTipSeen).toHaveBeenCalledWith("tip1");
  });

  it("does not show when wizard is not completed", () => {
    mockProgress.wizardCompleted = false;
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not show when progress is dismissed", () => {
    mockProgress.dismissedAt = "2025-01-01";
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not show when tip has already been seen", () => {
    mockProgress.microTipsSeen = ["tip1"];
    render(
      <MicroTip tipKey="tip1" content="Helpful tip">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("uses default position top", () => {
    render(
      <MicroTip tipKey="tip1" content="Tip text">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.className).toContain("bottom-full");
  });

  it("applies bottom position class", () => {
    render(
      <MicroTip tipKey="tip1" content="Tip text" position="bottom">
        <span>Child</span>
      </MicroTip>,
    );
    act(() => {
      vi.advanceTimersByTime(600);
    });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.className).toContain("top-full");
  });
});
