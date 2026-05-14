import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent } from "@/lib/agents/types";

const mockCommands = vi.fn();
const mockEnqueue = vi.fn();

vi.mock("@/hooks/use-agent-commands", () => ({
  useAgentCommands: () => mockCommands(),
}));

vi.mock("@/app/dashboard/agents/actions", () => ({
  enqueueAgentCommand: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("@/components/ui/status-dot", () => ({
  StatusDot: ({ color }: { color: string }) => (
    <span data-testid="status-dot" data-color={color} />
  ),
}));

vi.mock("@/components/shared/loading-skeleton", () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock("@/components/shared/confirm-delete-dialog", () => ({
  ConfirmDeleteDialog: ({
    open,
    onConfirm,
    onCancel,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <p>{title}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

import { AgentProvisioning } from "@/components/agents/agent-provisioning";

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

function makeCommand(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmd-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    gateway_id: "gw-1",
    agent_id: "a-1",
    agent_slug: "scout",
    action: "provision" as const,
    payload: {},
    status: "done" as const,
    leased_at: null,
    leased_until: null,
    started_at: null,
    completed_at: "2025-01-01T00:01:00Z",
    failed_at: null,
    exit_code: 0,
    stdout: null,
    stderr: null,
    error_message: null,
    requested_by: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnqueue.mockResolvedValue(undefined);
});

describe("AgentProvisioning", () => {
  it("renders Operations heading", () => {
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("renders loading skeleton when loading with no commands", () => {
    mockCommands.mockReturnValue({
      commands: [],
      loading: true,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("renders empty state when no commands exist", () => {
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("No commands")).toBeInTheDocument();
  });

  it("shows Provision button when no provision command exists", () => {
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Provision")).toBeInTheDocument();
  });

  it("hides Provision action button when provision command exists", () => {
    mockCommands.mockReturnValue({
      commands: [makeCommand({ action: "provision" })],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    const provisionButtons = screen.getAllByText("Provision");
    const actionButton = provisionButtons.find(
      (el) => el.tagName === "BUTTON" || el.closest("button")
    );
    const inCommandRow = provisionButtons.find(
      (el) => el.closest(".border-b")
    );
    expect(inCommandRow).toBeTruthy();
    expect(provisionButtons.length).toBe(1);
  });

  it("always shows Update button", () => {
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Update")).toBeInTheDocument();
  });

  it("always shows Remove button", () => {
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("renders provisioning banner for done status", () => {
    mockCommands.mockReturnValue({
      commands: [makeCommand({ action: "provision", status: "done" })],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Provisioned successfully")).toBeInTheDocument();
  });

  it("renders provisioning banner for failed status", () => {
    mockCommands.mockReturnValue({
      commands: [
        makeCommand({
          action: "provision",
          status: "failed",
          error_message: "timeout",
        }),
      ],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText(/Provisioning failed.*timeout/)).toBeInTheDocument();
  });

  it("renders provisioning banner for running status", () => {
    mockCommands.mockReturnValue({
      commands: [makeCommand({ action: "provision", status: "running" })],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Provisioning in progress…")).toBeInTheDocument();
  });

  it("renders status filter tabs", () => {
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("calls setStatusFilter when tab is clicked", async () => {
    const user = userEvent.setup();
    const setStatusFilter = vi.fn();
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter,
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    await user.click(screen.getByText("Failed"));
    expect(setStatusFilter).toHaveBeenCalledWith("failed");
  });

  it("renders command rows with action labels", () => {
    mockCommands.mockReturnValue({
      commands: [
        makeCommand({ id: "cmd-1", action: "provision", status: "done" }),
        makeCommand({ id: "cmd-2", action: "update", status: "pending" }),
      ],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Provision")).toBeInTheDocument();
    expect(screen.getByText("Update Agent")).toBeInTheDocument();
  });

  it("shows Load more button when hasMore is true", () => {
    mockCommands.mockReturnValue({
      commands: [makeCommand()],
      loading: false,
      hasMore: true,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    expect(screen.getByText("Load more")).toBeInTheDocument();
  });

  it("opens confirm dialog when Remove is clicked", async () => {
    const user = userEvent.setup();
    mockCommands.mockReturnValue({
      commands: [],
      loading: false,
      hasMore: false,
      loadMore: vi.fn(),
      statusFilter: "all",
      setStatusFilter: vi.fn(),
    });
    render(<AgentProvisioning agent={makeAgent()} />);
    await user.click(screen.getByText("Remove"));
    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Remove agent "Scout"\?/)).toBeInTheDocument();
  });
});
