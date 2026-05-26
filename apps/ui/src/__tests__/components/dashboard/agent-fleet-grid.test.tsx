import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AgentFleetEnriched } from "@/lib/types/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}));

import { AgentFleetGrid } from "@/app/dashboard/components/agent-fleet-grid";

function buildFleetAgent(overrides: Partial<AgentFleetEnriched> = {}): AgentFleetEnriched {
  return {
    id: "a-1",
    name: "ResearchBot",
    slug: "researchbot",
    status: "ready",
    emoji: "🔍",
    role: "Researcher",
    description: "Researches topics",
    last_seen_at: new Date().toISOString(),
    avatar_url: null,
    currentWork: null,
    currentWorkType: null,
    lastActivity: null,
    lastActivityAt: null,
    todayTasksCompleted: 0,
    todaySpendUsd: 0,
    ...overrides,
  };
}

describe("AgentFleetGrid", () => {
  it("renders empty state when no agents", () => {
    render(<AgentFleetGrid agents={[]} />);
    expect(screen.getByTestId("empty-state")).toHaveTextContent(
      "No agents yet",
    );
  });

  it("renders agent cards", () => {
    const agents = [
      buildFleetAgent({ id: "a-1", name: "ResearchBot", slug: "researchbot" }),
      buildFleetAgent({ id: "a-2", name: "WriterBot", slug: "writerbot", emoji: "✍️" }),
    ];
    render(<AgentFleetGrid agents={agents} />);
    expect(screen.getByText("ResearchBot")).toBeInTheDocument();
    expect(screen.getByText("WriterBot")).toBeInTheDocument();
  });

  it("shows view all link with agent count", () => {
    const agents = [
      buildFleetAgent({ id: "a-1", name: "Bot1", slug: "bot1" }),
      buildFleetAgent({ id: "a-2", name: "Bot2", slug: "bot2" }),
      buildFleetAgent({ id: "a-3", name: "Bot3", slug: "bot3" }),
    ];
    render(<AgentFleetGrid agents={agents} />);
    expect(screen.getByText(/View all 3/)).toBeInTheDocument();
  });

  it("links agent cards to their detail page", () => {
    const agents = [
      buildFleetAgent({ id: "a-1", name: "ResearchBot", slug: "researchbot" }),
    ];
    render(<AgentFleetGrid agents={agents} />);
    const link = screen.getByRole("link", { name: /ResearchBot/ });
    expect(link).toHaveAttribute("href", "/dashboard/agents/researchbot");
  });
});
