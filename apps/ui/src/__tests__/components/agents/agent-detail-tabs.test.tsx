import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent } from "@/lib/agents/types";
import { buildAgent, resetAgentCounter } from "../../helpers/factories";

// ── Mocks (before component import) ────────────────────────────────

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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUpdateAgent = vi.fn().mockResolvedValue(undefined);
const mockTogglePause = vi.fn().mockResolvedValue({ ok: true, newStatus: "paused" });
const mockDeleteAgent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/dashboard/agents/actions", () => ({
  updateAgent: (...args: unknown[]) => mockUpdateAgent(...args),
  toggleAgentPauseAction: (...args: unknown[]) => mockTogglePause(...args),
  deleteAgentAction: (...args: unknown[]) => mockDeleteAgent(...args),
}));

const mockGetDesktopUrl = vi.fn().mockResolvedValue({ ok: false, error: "no url" });
vi.mock("@/app/dashboard/settings/gateways/actions", () => ({
  getGatewayDesktopUrlAction: (...args: unknown[]) => mockGetDesktopUrl(...args),
}));

vi.mock("@/components/agents/agent-file-browser", () => ({
  AgentFileBrowser: () => <div data-testid="agent-file-browser" />,
}));
vi.mock("./agent-browser-tab", () => ({
  AgentBrowserTab: () => <div data-testid="agent-browser-tab" />,
}));
vi.mock("@/components/routines/routines-section", () => ({
  RoutinesSection: () => <div data-testid="routines-section" />,
}));
vi.mock("@/components/agents/agent-channel-card", () => ({
  AgentChannelCard: () => <div data-testid="agent-channel-card" />,
}));
vi.mock("@/components/agents/agent-model-section", () => ({
  AgentModelSection: () => <div data-testid="agent-model-section" />,
}));
vi.mock("@/components/agents/agent-org-slice", () => ({
  AgentOrgSlice: () => <div data-testid="agent-org-slice" />,
}));
vi.mock("./agent-usage-rail", () => ({
  AgentUsageRail: () => <div data-testid="agent-usage-rail" />,
}));
vi.mock("./agent-secrets-tab", () => ({
  AgentSecretsTab: () => <div data-testid="agent-secrets-tab" />,
}));
vi.mock("./agent-knowledge-section", () => ({
  AgentKnowledgeSection: () => <div data-testid="agent-knowledge-section" />,
}));
vi.mock("@/components/inbox/inbox-section", () => ({
  InboxSection: () => <div data-testid="inbox-section" />,
}));
vi.mock("@/components/agents/agent-provisioning", () => ({
  AgentProvisioning: () => <div data-testid="agent-provisioning" />,
}));
vi.mock("@/components/gateways/open-desktop-modal", () => ({
  OpenDesktopModal: () => <div data-testid="open-desktop-modal" />,
}));
vi.mock("@/components/onboarding/micro-tip", () => ({
  MicroTip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock DetailHeader/DetailSidebar to pass through children
vi.mock("@/components/shared/detail-header", () => ({
  DetailHeader: ({
    identityTitle,
    identityMeta,
    identityDescription,
    overflow,
  }: Record<string, React.ReactNode>) => (
    <div data-testid="detail-header">
      <div data-testid="identity-title">{identityTitle}</div>
      <div data-testid="identity-meta">{identityMeta}</div>
      <div data-testid="identity-description">{identityDescription}</div>
      <div data-testid="overflow">{overflow}</div>
    </div>
  ),
}));

vi.mock("@/components/shared/detail-sidebar", () => ({
  DetailSidebar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="detail-sidebar">{children}</div>
  ),
  DetailSidebarInline: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="detail-sidebar-inline">{children}</div>
  ),
  DetailSidebarSection: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div data-testid={`sidebar-section-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <span>{title}</span>
      {children}
    </div>
  ),
  DetailSidebarPropertyGrid: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DetailSidebarProperty: ({
    children,
    label,
  }: {
    children: React.ReactNode;
    label: string;
  }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
}));

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
    confirmLabel,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel: string;
    description?: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/inline-edit", () => ({
  InlineEdit: ({
    value,
    onSave,
    placeholder,
  }: {
    value: string;
    onSave: (v: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    type?: string;
  }) => (
    <div data-testid="inline-edit">
      <span>{value || placeholder}</span>
      <button onClick={() => onSave("New Name")}>save-inline</button>
    </div>
  ),
}));

import { AgentDetailTabs } from "@/components/agents/agent-detail-tabs";

// ── Helpers ─────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return buildAgent({
    id: "agent-detail-1",
    name: "Scout",
    slug: "scout",
    status: "ready",
    gateway_id: "gw-1",
    created_at: "2025-01-15T00:00:00Z",
    ...overrides,
  });
}

describe("AgentDetailTabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAgentCounter();
  });

  it("renders agent name in header", () => {
    render(<AgentDetailTabs agent={makeAgent()} />);
    const names = screen.getAllByText("Scout");
    expect(names.length).toBeGreaterThan(0);
  });

  it("renders status badge text", () => {
    render(<AgentDetailTabs agent={makeAgent({ status: "ready" })} />);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
  });

  it("renders paused status label", () => {
    render(<AgentDetailTabs agent={makeAgent({ status: "paused" })} />);
    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0);
  });

  it("shows correct tabs when gateway is set", () => {
    render(<AgentDetailTabs agent={makeAgent()} />);
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Secrets" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Live Browser" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeInTheDocument();
  });

  it("hides Browser tab when no gateway_id", () => {
    render(<AgentDetailTabs agent={makeAgent({ gateway_id: null })} />);
    expect(screen.queryByRole("tab", { name: "Live Browser" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
  });

  it("tab switching works", async () => {
    const user = userEvent.setup();
    render(<AgentDetailTabs agent={makeAgent()} />);
    const filesTab = screen.getByRole("tab", { name: "Files" });
    await user.click(filesTab);
    expect(filesTab).toHaveAttribute("data-state", "active");
  });

  it("shows pause button for ready agents in sidebar", () => {
    render(<AgentDetailTabs agent={makeAgent({ status: "ready" })} />);
    const pauseButtons = screen.getAllByText("Pause agent");
    expect(pauseButtons.length).toBeGreaterThan(0);
  });

  it("shows resume button for paused agents in sidebar", () => {
    render(<AgentDetailTabs agent={makeAgent({ status: "paused" })} />);
    const resumeButtons = screen.getAllByText("Resume agent");
    expect(resumeButtons.length).toBeGreaterThan(0);
  });

  it("pause button calls toggleAgentPauseAction", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    render(
      <AgentDetailTabs agent={makeAgent({ status: "ready" })} onAgentUpdated={onUpdated} />
    );
    const pauseButtons = screen.getAllByText("Pause agent");
    await user.click(pauseButtons[0]);
    await waitFor(() => {
      expect(mockTogglePause).toHaveBeenCalledWith("agent-detail-1", "ready");
    });
  });

  it("delete button shows confirm dialog", async () => {
    const user = userEvent.setup();
    render(<AgentDetailTabs agent={makeAgent()} />);
    const menuTrigger = screen.getByLabelText("Agent actions");
    await user.click(menuTrigger);
    const removeItem = screen.getByText("Remove agent");
    await user.click(removeItem);
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete Scout?")).toBeInTheDocument();
  });

  it("name inline edit calls updateAgent", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    render(<AgentDetailTabs agent={makeAgent()} onAgentUpdated={onUpdated} />);
    const saveButtons = screen.getAllByText("save-inline");
    await user.click(saveButtons[0]);
    await waitFor(() => {
      expect(mockUpdateAgent).toHaveBeenCalledWith({ agentId: "agent-detail-1", name: "New Name" });
    });
  });

  it("renders slug in properties section", () => {
    render(<AgentDetailTabs agent={makeAgent()} />);
    const slugTexts = screen.getAllByText("@scout");
    expect(slugTexts.length).toBeGreaterThan(0);
  });
});
