import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Connection } from "@/lib/connections/types";

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

const mockReadConnections = vi.fn();
const mockEnqueueCommand = vi.fn();
const mockWaitForCommand = vi.fn();

vi.mock("@/app/dashboard/settings/connections/actions", () => ({
  readConnectionsForGateway: (...args: any[]) => mockReadConnections(...args),
  enqueueConnectionCommand: (...args: any[]) => mockEnqueueCommand(...args),
  waitForCommand: (...args: any[]) => mockWaitForCommand(...args),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AgentRailModelSection } from "@/components/connections/agent-rail-model-section";

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "anthropic:default",
    provider: "anthropic",
    profileName: "default",
    gatewayId: "gw-1",
    status: "ok",
    isDefault: true,
    ...overrides,
  };
}

describe("AgentRailModelSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadConnections.mockResolvedValue({
      ok: true,
      data: { connections: [] },
    });
  });

  it("renders 'Manage connections' link", async () => {
    render(<AgentRailModelSection gatewayId="gw-1" />);
    const link = screen.getByText("Manage connections");
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "/dashboard/settings/connections",
    );
  });

  it("shows 'No models connected' when there are no connections", async () => {
    mockReadConnections.mockResolvedValue({
      ok: true,
      data: { connections: [] },
    });

    render(<AgentRailModelSection gatewayId="gw-1" />);

    await waitFor(() => {
      expect(screen.getByText("No models connected.")).toBeInTheDocument();
    });
  });

  it("renders healthy connections with provider names", async () => {
    mockReadConnections.mockResolvedValue({
      ok: true,
      data: {
        connections: [
          makeConnection({ status: "ok", isDefault: true }),
          makeConnection({
            id: "openai:default",
            provider: "openai",
            status: "ok",
            isDefault: false,
          }),
        ],
      },
    });

    render(<AgentRailModelSection gatewayId="gw-1" />);

    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("OpenAI (API key)")).toBeInTheDocument();
    });
  });

  it("only shows healthy connections (status === ok)", async () => {
    mockReadConnections.mockResolvedValue({
      ok: true,
      data: {
        connections: [
          makeConnection({ status: "ok", isDefault: true }),
          makeConnection({
            id: "openai:default",
            provider: "openai",
            status: "expired",
            isDefault: false,
          }),
        ],
      },
    });

    render(<AgentRailModelSection gatewayId="gw-1" />);

    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });
    expect(screen.queryByText("OpenAI (API key)")).not.toBeInTheDocument();
  });

  it("disables the default connection button", async () => {
    mockReadConnections.mockResolvedValue({
      ok: true,
      data: {
        connections: [makeConnection({ status: "ok", isDefault: true })],
      },
    });

    render(<AgentRailModelSection gatewayId="gw-1" />);

    await waitFor(() => {
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });

    const btn = screen.getByRole("button", { name: /anthropic/i });
    expect(btn).toBeDisabled();
  });

  it("allows clicking a non-default connection to set it as default", async () => {
    const user = userEvent.setup();

    mockReadConnections.mockResolvedValue({
      ok: true,
      data: {
        connections: [
          makeConnection({ status: "ok", isDefault: true }),
          makeConnection({
            id: "openai:default",
            provider: "openai",
            status: "ok",
            isDefault: false,
          }),
        ],
      },
    });

    mockEnqueueCommand.mockResolvedValue({
      ok: true,
      data: { commandId: "cmd-1" },
    });
    mockWaitForCommand.mockResolvedValue({
      ok: true,
      data: { status: "done" },
    });

    render(<AgentRailModelSection gatewayId="gw-1" />);

    await waitFor(() => {
      expect(screen.getByText("OpenAI (API key)")).toBeInTheDocument();
    });

    const openaiBtn = screen.getByRole("button", {
      name: /openai \(api key\)/i,
    });
    expect(openaiBtn).not.toBeDisabled();

    await user.click(openaiBtn);

    await waitFor(() => {
      expect(mockEnqueueCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayId: "gw-1",
          action: "auth_set_default",
          payload: expect.objectContaining({ provider: "openai" }),
        }),
      );
    });
  });

  it("handles API error gracefully", async () => {
    mockReadConnections.mockResolvedValue({
      ok: false,
      error: "Network error",
    });

    render(<AgentRailModelSection gatewayId="gw-1" />);

    await waitFor(() => {
      expect(screen.getByText("No models connected.")).toBeInTheDocument();
    });
  });

  it("calls readConnectionsForGateway on mount", async () => {
    render(<AgentRailModelSection gatewayId="gw-1" />);
    await waitFor(() => {
      expect(mockReadConnections).toHaveBeenCalledWith("gw-1");
    });
  });
});
