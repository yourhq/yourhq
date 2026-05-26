import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { WorkspacePulseData } from "@/lib/types/dashboard";

vi.mock("@/components/shared/modules-context", () => ({
  useModules: vi.fn(() => ({ crm: true })),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));


import { WorkspacePulse } from "@/app/dashboard/components/workspace-pulse";
import { useModules } from "@/components/shared/modules-context";

function buildPulseData(
  overrides: Partial<WorkspacePulseData> = {},
): WorkspacePulseData {
  return {
    tasks: {
      total: 10,
      todo: 3,
      inProgress: 4,
      blocked: 1,
      done: 2,
      overdue: 0,
      completionTrend7d: [],
    },
    crm: {
      totalContacts: 25,
      contactsAddedThisWeek: 3,
      interactionsThisWeek: 12,
      pipeline: [],
      followupsDue: 0,
    },
    spend: {
      total_spend_usd: 5.5,
      total_tokens: 50000,
      agent_count: 2,
      warned_count: 0,
      exceeded_count: 0,
      unmetered_count: 0,
      daily_spend_7d: [],
      top_spenders: [],
    },
    usage: {
      totalSpendUsd: 5.5,
      totalTokens: 50000,
      totalBudgetLimitUsd: 100,
      agentBudgets: [],
      dailySpend7d: [],
      warnedCount: 0,
      exceededCount: 0,
    },
    gateways: [],
    commandQueue: { pending: 0, running: 0, failed_24h: 0 },
    inboxQueue: { pending: 0, failed: 0, dead_letter: 0 },
    smartDefaultTab: "tasks",
    ...overrides,
  };
}

describe("WorkspacePulse", () => {
  it("always shows Tasks tab", () => {
    render(<WorkspacePulse data={buildPulseData()} />);
    expect(screen.getByRole("tab", { name: "Tasks" })).toBeInTheDocument();
  });

  it("shows Pipeline tab when CRM is enabled", () => {
    render(<WorkspacePulse data={buildPulseData()} />);
    expect(screen.getByRole("tab", { name: "Pipeline" })).toBeInTheDocument();
  });

  it("hides Pipeline tab when CRM is disabled", () => {
    vi.mocked(useModules).mockReturnValue({ crm: false });
    render(<WorkspacePulse data={buildPulseData()} />);
    expect(screen.queryByRole("tab", { name: "Pipeline" })).not.toBeInTheDocument();
    vi.mocked(useModules).mockReturnValue({ crm: true });
  });

  it("shows Spend tab when agent_count > 0", () => {
    render(
      <WorkspacePulse
        data={buildPulseData({ spend: { ...buildPulseData().spend, agent_count: 3 } })}
      />,
    );
    expect(screen.getByRole("tab", { name: "Spend" })).toBeInTheDocument();
  });

  it("hides Spend tab when agent_count is 0", () => {
    render(
      <WorkspacePulse
        data={buildPulseData({ spend: { ...buildPulseData().spend, agent_count: 0 } })}
      />,
    );
    expect(screen.queryByRole("tab", { name: "Spend" })).not.toBeInTheDocument();
  });

  it("hides System tab when no gateways", () => {
    render(<WorkspacePulse data={buildPulseData({ gateways: [] })} />);
    expect(screen.queryByRole("tab", { name: "System" })).not.toBeInTheDocument();
  });

  it("shows System tab when gateways are present", () => {
    const gw = {
      id: "gw-1",
      slug: "default",
      label: "Default",
      status: "ready",
      last_seen_at: new Date().toISOString(),
    };
    render(<WorkspacePulse data={buildPulseData({ gateways: [gw] })} />);
    expect(screen.getByRole("tab", { name: "System" })).toBeInTheDocument();
  });
});
