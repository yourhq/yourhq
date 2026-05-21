import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent, AgentMeta } from "@/lib/agents/types";

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

vi.mock("@/hooks/use-agent-budget", () => ({
  useAgentBudget: () => ({ budget: null, loading: false, refresh: vi.fn() }),
}));

import {
  AgentRow,
  AgentIconButton,
  AGENT_STATUS,
  sortAgentsByStatus,
  groupAgentsByTeam,
  getFleetCounts,
} from "@/components/agents/agent-card";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "a-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    name: "Scout",
    slug: "scout",
    description: "Recon agent",
    avatar_url: null,
    status: "ready",
    last_seen_at: "2025-01-01T00:00:00Z",
    gateway_id: "gw-1",
    reports_to_id: null,
    domains: [],
    capabilities: null,
    model: null,
    thinking: null,
    config: {},
    meta: {},
    ...overrides,
  };
}

describe("AgentRow", () => {
  it("renders agent name and slug", () => {
    render(<AgentRow agent={makeAgent()} />);
    expect(screen.getByText("Scout")).toBeInTheDocument();
    expect(screen.getByText("@scout")).toBeInTheDocument();
  });

  it("renders description", () => {
    render(<AgentRow agent={makeAgent()} />);
    expect(screen.getByText("Recon agent")).toBeInTheDocument();
  });

  it("renders ready status label", () => {
    render(<AgentRow agent={makeAgent({ status: "ready" })} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders paused status label", () => {
    render(<AgentRow agent={makeAgent({ status: "paused" })} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("renders hibernating status label", () => {
    render(<AgentRow agent={makeAgent({ status: "hibernating" })} />);
    expect(screen.getByText("Sleeping")).toBeInTheDocument();
  });

  it("renders error status label", () => {
    render(<AgentRow agent={makeAgent({ status: "error" })} />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("renders provisioning status label", () => {
    render(<AgentRow agent={makeAgent({ status: "provisioning" })} />);
    expect(screen.getByText("Setting up")).toBeInTheDocument();
  });

  it("shows emoji from meta when no avatar_url", () => {
    const agent = makeAgent({ meta: { emoji: "🤖" } as AgentMeta });
    render(<AgentRow agent={agent} />);
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("shows avatar image when avatar_url is set", () => {
    const agent = makeAgent({ avatar_url: "https://example.com/a.png" });
    const { container } = render(<AgentRow agent={agent} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "https://example.com/a.png");
  });

  it("links to agent detail page", () => {
    render(<AgentRow agent={makeAgent()} />);
    const link = screen.getByRole("link", { name: "Scout" });
    expect(link).toHaveAttribute("href", "/dashboard/agents/scout");
  });

  it("shows 'Never' when last_seen_at is null", () => {
    render(<AgentRow agent={makeAgent({ last_seen_at: null })} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("handles missing description gracefully", () => {
    render(<AgentRow agent={makeAgent({ description: null })} />);
    expect(screen.getByText("Scout")).toBeInTheDocument();
  });

  it("fires onEdit when edit button is clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const agent = makeAgent();
    render(<AgentRow agent={agent} onEdit={onEdit} />);
    const editBtn = screen.getByRole("button", { name: "Edit" });
    await user.click(editBtn);
    expect(onEdit).toHaveBeenCalledWith(agent);
  });

  it("fires onTogglePause with agent id and status", async () => {
    const user = userEvent.setup();
    const onTogglePause = vi.fn();
    render(
      <AgentRow agent={makeAgent()} onTogglePause={onTogglePause} />
    );
    const btn = screen.getByRole("button", { name: "Pause" });
    await user.click(btn);
    expect(onTogglePause).toHaveBeenCalledWith("a-1", "ready");
  });

  it("shows Resume label when agent is paused", () => {
    render(
      <AgentRow
        agent={makeAgent({ status: "paused" })}
        onTogglePause={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Resume" })
    ).toBeInTheDocument();
  });

  it("fires onDelete with agent id", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<AgentRow agent={makeAgent()} onDelete={onDelete} />);
    const btn = screen.getByRole("button", { name: "Delete" });
    await user.click(btn);
    expect(onDelete).toHaveBeenCalledWith("a-1");
  });

  it("does not render action buttons when handlers are not provided", () => {
    render(<AgentRow agent={makeAgent()} />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});

describe("AgentIconButton", () => {
  it("renders with provided label as aria-label", () => {
    render(
      <AgentIconButton
        label="Do thing"
        onClick={vi.fn()}
        icon={<span>X</span>}
      />
    );
    expect(
      screen.getByRole("button", { name: "Do thing" })
    ).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <AgentIconButton label="Go" onClick={onClick} icon={<span>X</span>} />
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("sortAgentsByStatus", () => {
  it("orders by status priority then alphabetically", () => {
    const agents = [
      makeAgent({ name: "Zeta", status: "paused" }),
      makeAgent({ name: "Alpha", status: "ready" }),
      makeAgent({ name: "Beta", status: "ready" }),
    ];
    const sorted = sortAgentsByStatus(agents);
    expect(sorted.map((a) => a.name)).toEqual(["Alpha", "Beta", "Zeta"]);
  });

  it("puts unknown status last", () => {
    const agents = [
      makeAgent({ name: "A", status: "ready" }),
      makeAgent({ name: "B", status: "unknown" as Agent["status"] }),
    ];
    const sorted = sortAgentsByStatus(agents);
    expect(sorted[0].name).toBe("A");
    expect(sorted[1].name).toBe("B");
  });
});

describe("groupAgentsByTeam", () => {
  it("groups by meta.team and puts Ungrouped last", () => {
    const agents = [
      makeAgent({ name: "A", meta: { team: "Sales" } }),
      makeAgent({ name: "B", meta: {} }),
      makeAgent({ name: "C", meta: { team: "Engineering" } }),
    ];
    const groups = groupAgentsByTeam(agents);
    expect(groups.map((g) => g.team)).toEqual([
      "Engineering",
      "Sales",
      "Ungrouped",
    ]);
  });
});

describe("getFleetCounts", () => {
  it("returns counts for each present status", () => {
    const agents = [
      makeAgent({ status: "ready" }),
      makeAgent({ status: "ready" }),
      makeAgent({ status: "paused" }),
    ];
    const counts = getFleetCounts(agents);
    expect(counts).toEqual([
      { status: "ready", count: 2, color: "var(--status-success)", label: "ready" },
      { status: "paused", count: 1, color: "var(--status-warning)", label: "paused" },
    ]);
  });

  it("omits statuses with zero agents", () => {
    const agents = [makeAgent({ status: "error" })];
    const counts = getFleetCounts(agents);
    expect(counts).toHaveLength(1);
    expect(counts[0].status).toBe("error");
  });
});

describe("AGENT_STATUS", () => {
  it("defines all five statuses", () => {
    expect(Object.keys(AGENT_STATUS).sort()).toEqual([
      "error",
      "hibernating",
      "paused",
      "provisioning",
      "ready",
    ]);
  });

  it("ready has pulse enabled", () => {
    expect(AGENT_STATUS.ready.pulse).toBe(true);
  });

  it("paused has no pulse", () => {
    expect(AGENT_STATUS.paused.pulse).toBeUndefined();
  });
});
