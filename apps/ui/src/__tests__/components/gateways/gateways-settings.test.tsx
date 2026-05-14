import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Gateway } from "@/lib/gateways/types";

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

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("@/app/dashboard/settings/gateways/actions", () => ({
  listGatewaysAction: vi.fn().mockResolvedValue({ ok: true, data: [] }),
  removeGatewayAction: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/app/dashboard/agents/actions", () => ({
  enqueueAgentCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./add-gateway-dialog", () => ({
  AddGatewayDialog: () => null,
}));

import { GatewaysSettings } from "@/components/gateways/gateways-settings";

function makeGateway(overrides: Partial<Gateway> = {}): Gateway {
  return {
    id: "gw-1",
    slug: "home-mac",
    label: "Home Mac mini",
    status: "ready",
    last_seen_at: new Date().toISOString(),
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    meta: {},
    ...overrides,
  };
}

describe("GatewaysSettings", () => {
  afterEach(() => cleanup());

  it("renders the page header with title and description", () => {
    render(<GatewaysSettings initialGateways={[]} />);
    expect(screen.getByText("Gateways")).toBeInTheDocument();
    expect(
      screen.getByText(/A gateway is a computer where your agents live/)
    ).toBeInTheDocument();
  });

  it("shows empty state when no gateways", () => {
    render(<GatewaysSettings initialGateways={[]} />);
    expect(screen.getByText("No gateways yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Add the first computer where your agents will run/)
    ).toBeInTheDocument();
  });

  it("renders gateway rows with label, slug, and status", () => {
    const gw = makeGateway();
    render(<GatewaysSettings initialGateways={[gw]} />);
    expect(screen.getByText("Home Mac mini")).toBeInTheDocument();
    expect(screen.getByText("home-mac")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders multiple gateways", () => {
    const gateways = [
      makeGateway({ id: "gw-1", label: "Home Mac", slug: "home-mac" }),
      makeGateway({ id: "gw-2", label: "Cloud Box", slug: "cloud-box", status: "paused" }),
    ];
    render(<GatewaysSettings initialGateways={gateways} />);
    expect(screen.getByText("Home Mac")).toBeInTheDocument();
    expect(screen.getByText("Cloud Box")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("shows error status for gateways with error state", () => {
    const gw = makeGateway({ status: "error" });
    render(<GatewaysSettings initialGateways={[gw]} />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows provisioning status", () => {
    const gw = makeGateway({ status: "provisioning" });
    render(<GatewaysSettings initialGateways={[gw]} />);
    expect(screen.getByText("Setting up")).toBeInTheDocument();
  });

  it("shows stale badge when gateway is ready but heartbeat is old", () => {
    const gw = makeGateway({
      status: "ready",
      last_seen_at: "2020-01-01T00:00:00Z",
    });
    render(<GatewaysSettings initialGateways={[gw]} />);
    expect(screen.getByText("stale")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows 'Never' for last seen when last_seen_at is null", () => {
    const gw = makeGateway({ last_seen_at: null, status: "provisioning" });
    render(<GatewaysSettings initialGateways={[gw]} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("links gateway row to its detail page", () => {
    const gw = makeGateway();
    render(<GatewaysSettings initialGateways={[gw]} />);
    const link = screen.getByRole("link", { name: "Home Mac mini" });
    expect(link).toHaveAttribute("href", "/dashboard/settings/gateways/gw-1");
  });

  it("renders 'Add gateway' button", () => {
    render(<GatewaysSettings initialGateways={[]} />);
    const buttons = screen.getAllByRole("button", { name: /Add gateway/i });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});
