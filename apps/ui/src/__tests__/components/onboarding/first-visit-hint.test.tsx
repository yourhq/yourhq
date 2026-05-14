import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockMarkPageVisited = vi.fn();
const mockProgress = {
  wizardCompleted: true,
  dismissedAt: null,
  pagesVisited: [] as string[],
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
  microTipsSeen: [],
};

vi.mock("@/hooks/use-onboarding-progress", () => ({
  useOnboardingProgress: () => ({
    progress: mockProgress,
    markPageVisited: mockMarkPageVisited,
  }),
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

import { FirstVisitHint } from "@/components/onboarding/first-visit-hint";

describe("FirstVisitHint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgress.wizardCompleted = true;
    mockProgress.dismissedAt = null;
    mockProgress.pagesVisited = [];
  });

  it("renders title and description", () => {
    render(
      <FirstVisitHint
        pageKey="agents"
        title="Agents page"
        description="Manage your agents here"
      />,
    );
    expect(screen.getByText("Agents page")).toBeInTheDocument();
    expect(screen.getByText("Manage your agents here")).toBeInTheDocument();
  });

  it("renders the Got it dismiss button", () => {
    render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Description"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Dismiss hint" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Got it")).toBeInTheDocument();
  });

  it("renders CTA link when ctaLabel and ctaTarget are provided", () => {
    render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Desc"
        ctaLabel="Learn more"
        ctaTarget="/docs"
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/docs");
    expect(link.textContent).toContain("Learn more");
  });

  it("does not render CTA link when ctaLabel is missing", () => {
    render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Desc"
        ctaTarget="/docs"
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not render CTA link when ctaTarget is missing", () => {
    render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Desc"
        ctaLabel="Learn more"
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("returns null when wizard is not completed", () => {
    mockProgress.wizardCompleted = false;
    const { container } = render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Desc"
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null when progress is dismissed", () => {
    mockProgress.dismissedAt = "2025-01-01";
    const { container } = render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Desc"
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null when page has already been visited", () => {
    mockProgress.pagesVisited = ["agents"];
    const { container } = render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Desc"
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("calls markPageVisited after dismiss button is clicked", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    render(
      <FirstVisitHint
        pageKey="tasks"
        title="Title"
        description="Desc"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Dismiss hint" }));
    vi.advanceTimersByTime(250);
    expect(mockMarkPageVisited).toHaveBeenCalledWith("tasks");
    vi.useRealTimers();
  });

  it("renders lightbulb icon", () => {
    const { container } = render(
      <FirstVisitHint
        pageKey="agents"
        title="Title"
        description="Desc"
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
