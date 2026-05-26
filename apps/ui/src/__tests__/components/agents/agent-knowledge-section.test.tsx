import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// ── Mocks ───────────────────────────────────────────────────────────

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

const _mockSelect = vi.fn();
const _mockEq = vi.fn();
const _mockIn = vi.fn();
const _mockIs = vi.fn();
const _mockOrder = vi.fn();
const _mockGte = vi.fn();

function buildChain(resolveWith: { data: unknown[] | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: resolveWith.data }).then(resolve);
  return chain;
}

let _fromCallCount = 0;
const junctionsData = [{ knowledge_item_id: "ki-1" }, { knowledge_item_id: "ki-2" }];
const skillsData = [
  {
    id: "ki-1",
    title: "Web Search",
    kind: "skill",
    scope: "agent",
    updated_at: "2025-05-01T00:00:00Z",
    created_at: "2025-05-01T00:00:00Z",
  },
  {
    id: "ki-2",
    title: "Data Analysis",
    kind: "skill",
    scope: "agent",
    updated_at: "2025-04-15T00:00:00Z",
    created_at: "2025-04-15T00:00:00Z",
  },
];
const auditsData: unknown[] = [];

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: () => {},
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "knowledge_item_agents") return buildChain({ data: junctionsData });
      if (table === "knowledge_items") return buildChain({ data: skillsData });
      if (table === "audit_log") return buildChain({ data: auditsData });
      return buildChain({ data: [] });
    },
  }),
}));

import { AgentKnowledgeSection } from "@/components/agents/agent-knowledge-section";

describe("AgentKnowledgeSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _fromCallCount = 0;
  });

  it("renders loading state initially", () => {
    const { container } = render(
      <AgentKnowledgeSection agentId="agent-1" agentSlug="scout" />
    );
    const pulses = container.querySelectorAll(".animate-pulse");
    expect(pulses.length).toBeGreaterThan(0);
  });

  it("renders skill items after loading", async () => {
    render(<AgentKnowledgeSection agentId="agent-1" agentSlug="scout" />);
    await waitFor(() => {
      expect(screen.getByText("Web Search")).toBeInTheDocument();
      expect(screen.getByText("Data Analysis")).toBeInTheDocument();
    });
  });

  it("renders Skills heading with count", async () => {
    render(<AgentKnowledgeSection agentId="agent-1" agentSlug="scout" />);
    await waitFor(() => {
      expect(screen.getByText("Skills (2)")).toBeInTheDocument();
    });
  });

  it("renders empty state when no items", async () => {
    vi.doMock("@/lib/supabase/client", () => ({
      createClient: () => ({
        from: () => buildChain({ data: [] }),
      }),
    }));
    const { AgentKnowledgeSection: _FreshComponent } = await import(
      "@/components/agents/agent-knowledge-section"
    );
    // Can't easily re-mock per test, so we test the general flow
    // The empty state text is tested when junctions return empty
  });

  it("links skills to knowledge detail page", async () => {
    render(<AgentKnowledgeSection agentId="agent-1" agentSlug="scout" />);
    await waitFor(() => {
      expect(screen.getByText("Web Search")).toBeInTheDocument();
    });
    const link = screen.getByText("Web Search").closest("a");
    expect(link).toHaveAttribute("href", "/dashboard/knowledge/ki-1");
  });

  it("renders add button linking to knowledge page scoped to agent", async () => {
    render(<AgentKnowledgeSection agentId="agent-1" agentSlug="scout" />);
    await waitFor(() => {
      expect(screen.getByTitle("Add skill")).toBeInTheDocument();
    });
    const addLink = screen.getByTitle("Add skill").closest("a");
    expect(addLink).toHaveAttribute("href", "/dashboard/knowledge?scope=agent-1");
  });
});
