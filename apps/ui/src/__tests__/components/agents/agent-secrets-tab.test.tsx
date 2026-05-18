import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentSecretView } from "@/lib/secrets/types";

// ── Mocks ───────────────────────────────────────────────────────────

const mockSecrets: AgentSecretView[] = [
  {
    id: "s-1",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    gateway_id: "gw-1",
    agent_id: "agent-1",
    key: "OPENAI_API_KEY",
    name: "OpenAI Key",
    category: "user",
    note: null,
    sync_status: "active",
    last_synced_at: "2025-01-01T00:00:00Z",
    scope: "agent",
  },
  {
    id: "s-2",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    gateway_id: "gw-1",
    agent_id: null,
    key: "SLACK_TOKEN",
    name: "Slack Token",
    category: "channel",
    note: null,
    sync_status: "active",
    last_synced_at: "2025-01-01T00:00:00Z",
    scope: "gateway",
  },
];

const mockListSecrets = vi.fn().mockResolvedValue({
  ok: true,
  data: { secrets: mockSecrets },
});
const mockDeleteSecret = vi.fn().mockResolvedValue({ ok: true });

vi.mock("@/app/dashboard/settings/secrets/actions", () => ({
  listSecretsForAgent: (...args: unknown[]) => mockListSecrets(...args),
  deleteSecret: (...args: unknown[]) => mockDeleteSecret(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/use-realtime", () => ({
  useRealtime: vi.fn(),
}));

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

vi.mock("@/components/secrets/secret-row", () => ({
  SecretRow: ({
    secret,
    onEdit,
    onRemove,
    scopeLabel,
  }: {
    secret: AgentSecretView;
    isFirst: boolean;
    onEdit: () => void;
    onRemove: () => void;
    scopeLabel: string;
  }) => (
    <div data-testid={`secret-row-${secret.id}`}>
      <span>{secret.name}</span>
      <span>{scopeLabel}</span>
      <button onClick={onEdit}>Edit</button>
      <button onClick={onRemove}>Remove</button>
    </div>
  ),
}));

vi.mock("@/components/secrets/add-secret-dialog", () => ({
  AddSecretDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    gatewayId: string;
    agentId: string;
    agentName: string;
    onCreated: () => void;
  }) => (open ? <div data-testid="add-secret-dialog">Add Secret Dialog</div> : null),
}));

vi.mock("@/components/secrets/edit-secret-dialog", () => ({
  EditSecretDialog: ({
    open,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    secret: AgentSecretView;
    onUpdated: () => void;
  }) => (open ? <div data-testid="edit-secret-dialog">Edit Secret Dialog</div> : null),
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
    description?: React.ReactNode;
    tone?: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>{confirmLabel}</button>
        <button onClick={onCancel}>Cancel confirm</button>
      </div>
    ) : null,
}));

vi.mock("@/components/shared/empty-state", () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    icon: unknown;
    title: string;
    description: string;
    action?: { label: string; icon: unknown; onClick: () => void };
    compact?: boolean;
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{description}</span>
      {action && <button onClick={action.onClick}>{action.label}</button>}
    </div>
  ),
}));

import { AgentSecretsTab } from "@/components/agents/agent-secrets-tab";

describe("AgentSecretsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows gateway missing message when gatewayId is null", () => {
    render(
      <AgentSecretsTab agentId="agent-1" agentName="Scout" gatewayId={null} />
    );
    expect(screen.getByText("No gateway assigned")).toBeInTheDocument();
  });

  it("renders empty state when no secrets", async () => {
    mockListSecrets.mockResolvedValueOnce({
      ok: true,
      data: { secrets: [] },
    });
    render(
      <AgentSecretsTab agentId="agent-1" agentName="Scout" gatewayId="gw-1" />
    );
    await waitFor(() => {
      expect(screen.getByText("No secrets yet")).toBeInTheDocument();
    });
  });

  it("renders secret rows after loading", async () => {
    render(
      <AgentSecretsTab agentId="agent-1" agentName="Scout" gatewayId="gw-1" />
    );
    await waitFor(() => {
      expect(screen.getByTestId("secret-row-s-1")).toBeInTheDocument();
      expect(screen.getByTestId("secret-row-s-2")).toBeInTheDocument();
    });
  });

  it("add button opens dialog", async () => {
    const user = userEvent.setup();
    render(
      <AgentSecretsTab agentId="agent-1" agentName="Scout" gatewayId="gw-1" />
    );
    await waitFor(() => {
      expect(screen.getByText("Add secret")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add secret"));
    await waitFor(() => {
      expect(screen.getByTestId("add-secret-dialog")).toBeInTheDocument();
    });
  });

  it("delete confirmation flow", async () => {
    const user = userEvent.setup();
    render(
      <AgentSecretsTab agentId="agent-1" agentName="Scout" gatewayId="gw-1" />
    );
    await waitFor(() => {
      expect(screen.getByTestId("secret-row-s-1")).toBeInTheDocument();
    });
    const removeButtons = screen.getAllByText("Remove");
    await user.click(removeButtons[0]);
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
      expect(screen.getByText("Remove OpenAI Key?")).toBeInTheDocument();
    });
  });

  it("renders scope labels for agent and gateway secrets", async () => {
    render(
      <AgentSecretsTab agentId="agent-1" agentName="Scout" gatewayId="gw-1" />
    );
    await waitFor(() => {
      expect(screen.getByText("Only for Scout")).toBeInTheDocument();
      expect(screen.getByText("All agents")).toBeInTheDocument();
    });
  });
});
