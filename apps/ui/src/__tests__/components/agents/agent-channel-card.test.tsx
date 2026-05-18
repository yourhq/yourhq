import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent } from "@/lib/agents/types";

vi.mock("@/app/dashboard/agents/actions", () => ({
  connectAgentChannel: vi.fn(),
  submitAgentPairing: vi.fn(),
  pollProvisionStatus: vi.fn(),
}));

vi.mock("@/lib/onboarding/progress", () => ({
  completeItem: vi.fn(),
}));

vi.mock("@/components/ui/input-otp", () => ({
  InputOTP: ({
    children,
    onChange,
  }: {
    children: React.ReactNode;
    onChange?: (v: string) => void;
    maxLength?: number;
    value?: string;
    onComplete?: () => void;
  }) => <div data-testid="input-otp">{children}</div>,
  InputOTPGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  InputOTPSlot: ({ index }: { index: number }) => (
    <input data-testid={`otp-slot-${index}`} />
  ),
}));

import { AgentChannelCard } from "@/components/agents/agent-channel-card";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AgentChannelCard", () => {
  it("renders channel selection phase when no channel connected", () => {
    render(<AgentChannelCard agent={makeAgent()} />);
    expect(screen.getByText("Messaging Channel")).toBeInTheDocument();
    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });

  it("shows star icon on Telegram (recommended)", () => {
    const { container } = render(<AgentChannelCard agent={makeAgent()} />);
    const telegramButton = screen.getByText("Telegram").closest("button");
    const starIcon = telegramButton?.querySelector(".lucide-star");
    expect(starIcon).toBeInTheDocument();
  });

  it("renders connected state when agent has a channel", () => {
    render(
      <AgentChannelCard
        agent={makeAgent({ meta: { channel: "telegram" } })}
      />
    );
    expect(screen.getByText("Connected via Telegram")).toBeInTheDocument();
  });

  it("shows Change button in connected state", () => {
    render(
      <AgentChannelCard
        agent={makeAgent({ meta: { channel: "discord" } })}
      />
    );
    expect(screen.getByText("Change")).toBeInTheDocument();
  });

  it("transitions to credentials phase when a channel is selected", async () => {
    const user = userEvent.setup();
    render(<AgentChannelCard agent={makeAgent()} />);
    await user.click(screen.getByText("Telegram"));
    expect(screen.getByText("Bot token")).toBeInTheDocument();
    expect(screen.getByText("Connect")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("shows Discord-specific fields when Discord is selected", async () => {
    const user = userEvent.setup();
    render(<AgentChannelCard agent={makeAgent()} />);
    await user.click(screen.getByText("Discord"));
    expect(screen.getByText("Bot token")).toBeInTheDocument();
    expect(screen.getByText("Server ID")).toBeInTheDocument();
    expect(screen.getByText("Your User ID")).toBeInTheDocument();
  });

  it("shows Slack-specific fields when Slack is selected", async () => {
    const user = userEvent.setup();
    render(<AgentChannelCard agent={makeAgent()} />);
    await user.click(screen.getByText("Slack"));
    expect(screen.getByText("App-Level Token")).toBeInTheDocument();
    expect(screen.getByText("Bot Token")).toBeInTheDocument();
  });

  it("Connect button is disabled when token is too short", async () => {
    const user = userEvent.setup();
    render(<AgentChannelCard agent={makeAgent()} />);
    await user.click(screen.getByText("Telegram"));
    const connectBtn = screen.getByText("Connect");
    expect(connectBtn.closest("button")).toBeDisabled();
  });

  it("navigates back to select phase when Back is clicked", async () => {
    const user = userEvent.setup();
    render(<AgentChannelCard agent={makeAgent()} />);
    await user.click(screen.getByText("Telegram"));
    expect(screen.getByText("Bot token")).toBeInTheDocument();
    await user.click(screen.getByText("Back"));
    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByText("Discord")).toBeInTheDocument();
  });

  it("shows helper instructions for Telegram", async () => {
    const user = userEvent.setup();
    render(<AgentChannelCard agent={makeAgent()} />);
    await user.click(screen.getByText("Telegram"));
    expect(screen.getByText("How to get it")).toBeInTheDocument();
    expect(screen.getByText("Follow the prompts")).toBeInTheDocument();
  });

  it("renders channel option labels", () => {
    render(<AgentChannelCard agent={makeAgent()} />);
    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });

  it("resets to channel select when Change is clicked in connected state", async () => {
    const user = userEvent.setup();
    render(
      <AgentChannelCard
        agent={makeAgent({ meta: { channel: "telegram" } })}
      />
    );
    await user.click(screen.getByText("Change"));
    expect(screen.getByText("Telegram")).toBeInTheDocument();
    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
  });
});
