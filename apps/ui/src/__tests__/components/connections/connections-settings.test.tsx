import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Connection, ConnectionStatus } from "@/lib/connections/types";
import type { Gateway } from "@/lib/gateways/types";

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("@/app/dashboard/settings/connections/actions", () => ({
  refreshConnectionsAction: vi.fn().mockResolvedValue({
    ok: true,
    data: { connections: [], lastCheckedAt: new Date().toISOString() },
  }),
  enqueueConnectionCommand: vi.fn().mockResolvedValue({
    ok: true,
    data: { commandId: "cmd-1" },
  }),
  waitForCommand: vi.fn().mockResolvedValue({
    ok: true,
    data: { status: "done" },
  }),
  readConnectionsForGateway: vi.fn().mockResolvedValue({
    ok: true,
    data: { connections: [], lastCheckedAt: null },
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/shared/page-header", () => ({
  PageHeader: ({ title, description, primaryAction }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{description}</p>
      {primaryAction}
    </div>
  ),
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({ open, title, onConfirm, onCancel }: any) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/connections/add-connection-dialog", () => ({
  AddConnectionDialog: ({ open }: any) =>
    open ? <div data-testid="add-dialog">Add Dialog</div> : null,
}));

import { ConnectionsSettings } from "@/components/connections/connections-settings";

function makeGateway(overrides: Partial<Gateway> = {}): Gateway {
  return {
    id: "gw-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    slug: "default",
    label: "Default Gateway",
    status: "online",
    novnc_url: null,
    tailscale_url: null,
    public_url: null,
    novnc_mode: "local",
    meta: {},
    ...overrides,
  } as Gateway;
}

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "anthropic:default",
    provider: "anthropic",
    profileName: "default",
    gatewayId: "gw-1",
    status: "ok" as ConnectionStatus,
    isDefault: true,
    ...overrides,
  };
}

describe("ConnectionsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the page header", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[]}
        initialLastCheckedAt={null}
      />,
    );
    expect(screen.getByText("Connections")).toBeInTheDocument();
  });

  it("renders empty state when no gateways exist", () => {
    render(
      <ConnectionsSettings
        initialGateways={[]}
        initialGatewayId={null}
        initialConnections={[]}
        initialLastCheckedAt={null}
      />,
    );
    expect(screen.getByText("No gateways yet")).toBeInTheDocument();
  });

  it("renders empty state when no connections exist", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[]}
        initialLastCheckedAt={null}
      />,
    );
    expect(screen.getByText("No connections yet")).toBeInTheDocument();
  });

  it("renders connection rows when connections exist", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[makeConnection()]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("shows the default badge for the default connection", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[makeConnection({ isDefault: true })]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("default")).toBeInTheDocument();
  });

  it("shows the Healthy status for ok connections", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[makeConnection({ status: "ok" })]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });

  it("shows expired status", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[
          makeConnection({ status: "expired", isDefault: false }),
        ]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("renders the Add connection button", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[]}
        initialLastCheckedAt={null}
      />,
    );
    expect(screen.getByText("Add connection")).toBeInTheDocument();
  });

  it("renders the Refresh button", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[makeConnection()]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("renders multiple connections", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[
          makeConnection({
            id: "anthropic:default",
            provider: "anthropic",
            isDefault: true,
          }),
          makeConnection({
            id: "openai:default",
            provider: "openai",
            isDefault: false,
          }),
        ]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI (API key)")).toBeInTheDocument();
  });

  it("does not show gateway picker for a single gateway", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[]}
        initialLastCheckedAt={null}
      />,
    );
    expect(
      screen.queryByText("Showing connections on"),
    ).not.toBeInTheDocument();
  });

  it("shows gateway picker when multiple gateways exist", () => {
    render(
      <ConnectionsSettings
        initialGateways={[
          makeGateway({ id: "gw-1", label: "Gateway 1" }),
          makeGateway({ id: "gw-2", label: "Gateway 2" }),
        ]}
        initialGatewayId="gw-1"
        initialConnections={[]}
        initialLastCheckedAt={null}
      />,
    );
    expect(screen.getByText("Showing connections on")).toBeInTheDocument();
  });

  it("shows invalid status for invalid connections", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[
          makeConnection({ status: "invalid", isDefault: false }),
        ]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows missing_credential status", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[
          makeConnection({
            status: "missing_credential",
            isDefault: false,
          }),
        ]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("Not configured")).toBeInTheDocument();
  });

  it("shows profile name for non-default profiles", () => {
    render(
      <ConnectionsSettings
        initialGateways={[makeGateway()]}
        initialGatewayId="gw-1"
        initialConnections={[
          makeConnection({ profileName: "work-account" }),
        ]}
        initialLastCheckedAt={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("work-account")).toBeInTheDocument();
  });
});
