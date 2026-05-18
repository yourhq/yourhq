import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockBudget = {
  agent_id: "a-1",
  monthly_limit_usd: 50,
  soft_threshold_pct: 80,
  hard_cutoff: true,
  period_anchor_tz: "UTC",
  current_period_start: "2026-05-01",
  current_period_spend_usd: 25,
  current_period_tokens: 500000,
  current_period_metered_calls: 100,
  current_period_unmetered_calls: 0,
  status: "ok" as const,
  warned_at: null,
  exceeded_at: null,
  last_usage_at: null,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  meta: {},
};

const mockUseAgentBudget = vi.fn();

vi.mock("@/hooks/use-agent-budget", () => ({
  useAgentBudget: (...args: unknown[]) => mockUseAgentBudget(...args),
}));

vi.mock("@/components/shared/detail-sidebar", () => ({
  DetailSidebarSection: ({
    title,
    children,
  }: {
    title?: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="sidebar-section">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  ),
}));

import { AgentUsageRail } from "@/components/agents/agent-usage-rail";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentUsageRail", () => {
  it("renders loading state", () => {
    mockUseAgentBudget.mockReturnValue({ budget: null, loading: true });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it("renders empty state when no budget data", () => {
    mockUseAgentBudget.mockReturnValue({ budget: null, loading: false });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("No usage data yet.")).toBeInTheDocument();
  });

  it("renders spend and token amounts", () => {
    mockUseAgentBudget.mockReturnValue({ budget: mockBudget, loading: false });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("500.0K tokens")).toBeInTheDocument();
  });

  it("renders budget limit and status label when limit is set", () => {
    mockUseAgentBudget.mockReturnValue({ budget: mockBudget, loading: false });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("of $50.00")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
  });

  it("renders 'No limit set' when monthly_limit_usd is null", () => {
    mockUseAgentBudget.mockReturnValue({
      budget: { ...mockBudget, monthly_limit_usd: null },
      loading: false,
    });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("No limit set")).toBeInTheDocument();
  });

  it("renders period label from current_period_start", () => {
    mockUseAgentBudget.mockReturnValue({ budget: mockBudget, loading: false });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("renders warned status when budget is warned", () => {
    mockUseAgentBudget.mockReturnValue({
      budget: { ...mockBudget, status: "warned" },
      loading: false,
    });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("renders exceeded status when budget is exceeded", () => {
    mockUseAgentBudget.mockReturnValue({
      budget: { ...mockBudget, status: "exceeded" },
      loading: false,
    });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("Exceeded")).toBeInTheDocument();
  });

  it("formats very small spend amounts with more decimals", () => {
    mockUseAgentBudget.mockReturnValue({
      budget: { ...mockBudget, current_period_spend_usd: 0.005 },
      loading: false,
    });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("$0.0050")).toBeInTheDocument();
  });

  it("formats large token counts as M", () => {
    mockUseAgentBudget.mockReturnValue({
      budget: { ...mockBudget, current_period_tokens: 2_500_000 },
      loading: false,
    });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("2.5M tokens")).toBeInTheDocument();
  });

  it("formats small token counts as plain numbers", () => {
    mockUseAgentBudget.mockReturnValue({
      budget: { ...mockBudget, current_period_tokens: 500 },
      loading: false,
    });
    render(<AgentUsageRail agentId="a-1" />);
    expect(screen.getByText("500 tokens")).toBeInTheDocument();
  });
});
