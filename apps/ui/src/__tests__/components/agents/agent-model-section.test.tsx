import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── Mocks ───────────────────────────────────────────────────────────

const mockSetAgentModel = vi.fn().mockResolvedValue({ ok: true });
vi.mock("@/app/dashboard/agents/actions", () => ({
  setAgentModelAction: (...args: unknown[]) => mockSetAgentModel(...args),
}));

const mockReadConnections = vi.fn().mockResolvedValue({
  ok: true,
  data: {
    connections: [
      {
        id: "anthropic:default",
        provider: "anthropic",
        profileName: "default",
        gatewayId: "gw-1",
        status: "ok",
        isDefault: true,
      },
    ],
  },
});
const mockRefreshConnections = vi.fn().mockResolvedValue({
  ok: true,
  data: { connections: [] },
});
vi.mock("@/app/dashboard/settings/connections/actions", () => ({
  readConnectionsForGateway: (...args: unknown[]) => mockReadConnections(...args),
  refreshConnectionsAction: (...args: unknown[]) => mockRefreshConnections(...args),
}));

vi.mock("@/lib/models/catalog", () => ({
  getCuratedModelsForProviders: (_providers: string[]) => [
    {
      provider: "anthropic",
      providerDisplayName: "Anthropic",
      models: [
        {
          id: "anthropic/claude-sonnet-4-20250514",
          displayName: "Claude Sonnet 4",
          provider: "anthropic",
          providerDisplayName: "Anthropic",
        },
        {
          id: "anthropic/claude-haiku-3.5",
          displayName: "Claude 3.5 Haiku",
          provider: "anthropic",
          providerDisplayName: "Anthropic",
        },
      ],
    },
  ],
  getModelDisplayName: (id: string) => {
    const map: Record<string, string> = {
      "anthropic/claude-sonnet-4-20250514": "Claude Sonnet 4",
      "anthropic/claude-haiku-3.5": "Claude 3.5 Haiku",
    };
    return map[id] ?? id;
  },
  getModelProvider: (id: string) => id.split("/")[0] ?? "unknown",
  getCanonicalProvider: (p: string) => p,
  makeCustomModelEntry: (id: string) => ({
    id,
    displayName: id,
    provider: id.split("/")[0] ?? "unknown",
    providerDisplayName: id.split("/")[0] ?? "unknown",
  }),
  AGGREGATOR_PROVIDERS: new Set(["openrouter"]),
  LOCAL_PROVIDERS: new Set(["ollama"]),
  ALL_KNOWN_PROVIDERS: ["anthropic", "openai", "google"],
}));

vi.mock("@/components/connections/provider-icons", () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => (
    <span data-testid={`provider-icon-${providerId}`} />
  ),
}));

vi.mock("@/components/onboarding/micro-tip", () => ({
  MicroTip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

import { AgentModelSection } from "@/components/agents/agent-model-section";

describe("AgentModelSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders current model display name", async () => {
    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel="anthropic/claude-sonnet-4-20250514"
        currentThinking={null}
        onModelChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
    });
  });

  it("renders 'No model selected' when currentModel is null and connections load", async () => {
    mockReadConnections.mockResolvedValueOnce({
      ok: true,
      data: { connections: [] },
    });
    mockRefreshConnections.mockResolvedValueOnce({
      ok: true,
      data: { connections: [] },
    });

    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel={null}
        currentThinking={null}
        onModelChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("No model selected")).toBeInTheDocument();
    });
  });

  it("shows model dropdown on click", async () => {
    const user = userEvent.setup();
    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel="anthropic/claude-sonnet-4-20250514"
        currentThinking={null}
        onModelChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
    });
    const trigger = screen.getByText("Claude Sonnet 4");
    await user.click(trigger);
    expect(screen.getByText("Claude 3.5 Haiku")).toBeInTheDocument();
  });

  it("shows thinking level dropdown", async () => {
    const user = userEvent.setup();
    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel="anthropic/claude-sonnet-4-20250514"
        currentThinking="medium"
        onModelChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Thinking: Medium")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Thinking: Medium"));
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders thinking as Off when null", async () => {
    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel={null}
        currentThinking={null}
        onModelChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Thinking: Off")).toBeInTheDocument();
    });
  });

  it("fetches connections on mount", async () => {
    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel={null}
        currentThinking={null}
        onModelChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(mockReadConnections).toHaveBeenCalledWith("gw-1");
    });
  });

  it("renders manage connections link", async () => {
    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel={null}
        currentThinking={null}
        onModelChange={vi.fn()}
      />
    );
    expect(screen.getByText("Manage connections")).toBeInTheDocument();
  });

  it("shows provider display name header in model dropdown", async () => {
    const user = userEvent.setup();
    render(
      <AgentModelSection
        agentId="agent-1"
        gatewayId="gw-1"
        currentModel="anthropic/claude-sonnet-4-20250514"
        currentThinking={null}
        onModelChange={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Claude Sonnet 4"));
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });
});
