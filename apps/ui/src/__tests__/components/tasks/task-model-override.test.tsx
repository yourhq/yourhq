import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent } from "@/lib/agents/types";

const mockReadConnections = vi.fn().mockResolvedValue({
  ok: true,
  data: {
    connections: [
      { id: "anthropic:default", provider: "anthropic", status: "ok" },
      { id: "openai:default", provider: "openai", status: "ok" },
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
  getCuratedModelsForProviders: () => [
    {
      provider: "anthropic",
      providerDisplayName: "Anthropic",
      models: [
        { id: "anthropic/claude-sonnet-4", displayName: "Claude Sonnet 4", provider: "anthropic", providerDisplayName: "Anthropic" },
        { id: "anthropic/claude-haiku-3.5", displayName: "Claude 3.5 Haiku", provider: "anthropic", providerDisplayName: "Anthropic" },
      ],
    },
    {
      provider: "openai",
      providerDisplayName: "OpenAI",
      models: [
        { id: "openai/gpt-5.4", displayName: "GPT-5.4", provider: "openai", providerDisplayName: "OpenAI" },
      ],
    },
  ],
  getModelDisplayName: (id: string) => {
    const map: Record<string, string> = {
      "anthropic/claude-sonnet-4": "Claude Sonnet 4",
      "anthropic/claude-haiku-3.5": "Claude 3.5 Haiku",
      "openai/gpt-5.4": "GPT-5.4",
    };
    return map[id] ?? id;
  },
  getModelProvider: (id: string) => id.split("/")[0],
  getCanonicalProvider: (p: string) => p,
  makeCustomModelEntry: (id: string) => ({
    id,
    displayName: id,
    provider: id.split("/")[0],
    providerDisplayName: id.split("/")[0],
  }),
  AGGREGATOR_PROVIDERS: new Set(["openrouter"]),
  LOCAL_PROVIDERS: new Set(["ollama"]),
  ALL_KNOWN_PROVIDERS: ["anthropic", "openai"],
}));

vi.mock("@/components/connections/provider-icons", () => ({
  ProviderIcon: ({ providerId, className }: { providerId: string; className?: string }) => (
    <span data-testid={`provider-icon-${providerId}`} className={className} />
  ),
}));

import { TaskModelOverride, connectionCache } from "@/components/tasks/task-model-override";

const agent: Agent = {
  id: "a-1",
  name: "Ghost",
  slug: "ghost",
  gateway_id: "gw-1",
  tenant_id: "t-1",
  created_at: "2025-01-01",
  template_id: null,
  model: null,
  thinking: null,
  reports_to_id: null,
  meta: {},
  budget_24h_usd: null,
  budget_monthly_usd: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  connectionCache.clear();
});

describe("TaskModelOverride", () => {
  it("shows Default for both when no overrides set", () => {
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride={null}
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    const defaults = screen.getAllByText("Default");
    expect(defaults.length).toBe(2);
  });

  it("shows model display name when override is set", () => {
    render(
      <TaskModelOverride
        modelOverride="anthropic/claude-sonnet-4"
        thinkingOverride={null}
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
  });

  it("shows thinking level label when override is set", () => {
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride="high"
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("opens model dropdown on click and shows providers", async () => {
    const user = userEvent.setup();
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride={null}
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    const defaults = screen.getAllByText("Default");
    await user.click(defaults[0]);
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
  });

  it("calls onModelChange when a model is selected", async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride={null}
        onModelChange={onModelChange}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    const defaults = screen.getAllByText("Default");
    await user.click(defaults[0]);
    await user.click(screen.getByText("Claude Sonnet 4"));
    expect(onModelChange).toHaveBeenCalledWith("anthropic/claude-sonnet-4");
  });

  it("opens thinking dropdown on click and shows levels", async () => {
    const user = userEvent.setup();
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride={null}
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    const defaults = screen.getAllByText("Default");
    await user.click(defaults[1]);
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();
  });

  it("calls onThinkingChange when a level is selected", async () => {
    const onThinkingChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride={null}
        onModelChange={vi.fn()}
        onThinkingChange={onThinkingChange}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    const defaults = screen.getAllByText("Default");
    await user.click(defaults[1]);
    await user.click(screen.getByText("High"));
    expect(onThinkingChange).toHaveBeenCalledWith("high");
  });

  it("calls onModelChange(null) when Default is clicked in model dropdown", async () => {
    const onModelChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskModelOverride
        modelOverride="anthropic/claude-sonnet-4"
        thinkingOverride={null}
        onModelChange={onModelChange}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    await user.click(screen.getByText("Claude Sonnet 4"));
    await user.click(screen.getByText("Default (agent's model)"));
    expect(onModelChange).toHaveBeenCalledWith(null);
  });

  it("calls onThinkingChange(null) when Default is clicked in thinking dropdown", async () => {
    const onThinkingChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride="high"
        onModelChange={vi.fn()}
        onThinkingChange={onThinkingChange}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    await user.click(screen.getByText("High"));
    const defaults = screen.getAllByText("Default");
    // defaults[0] is model button label, defaults[1] is thinking dropdown's Default option
    await user.click(defaults[defaults.length - 1]);
    expect(onThinkingChange).toHaveBeenCalledWith(null);
  });

  it("fetches connections for the agent's gateway", () => {
    render(
      <TaskModelOverride
        modelOverride={null}
        thinkingOverride={null}
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    expect(mockReadConnections).toHaveBeenCalledWith("gw-1");
  });

  it("shows provider icon when model is selected", () => {
    render(
      <TaskModelOverride
        modelOverride="anthropic/claude-sonnet-4"
        thinkingOverride={null}
        onModelChange={vi.fn()}
        onThinkingChange={vi.fn()}
        agentId="a-1"
        agents={[agent]}
      />,
    );
    expect(screen.getByTestId("provider-icon-anthropic")).toBeInTheDocument();
  });
});
