import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentBudget } from "@/lib/usage/types";

// ── Mocks ───────────────────────────────────────────────────────────

const mockSetAgentBudget = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/dashboard/agents/usage-actions", () => ({
  setAgentBudget: (...args: unknown[]) => mockSetAgentBudget(...args),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  ResponsiveDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  ResponsiveDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { AgentBudgetEditDialog } from "@/components/agents/agent-budget-edit-dialog";
import { toast } from "sonner";

// ── Helpers ─────────────────────────────────────────────────────────

function makeBudget(overrides: Partial<AgentBudget> = {}): AgentBudget {
  return {
    agent_id: "agent-1",
    monthly_limit_usd: 50,
    soft_threshold_pct: 80,
    hard_cutoff: true,
    period_anchor_tz: "UTC",
    current_period_start: "2025-01-01T00:00:00Z",
    current_period_spend_usd: 10,
    current_period_tokens: 5000,
    current_period_metered_calls: 20,
    current_period_unmetered_calls: 0,
    status: "ok",
    warned_at: null,
    exceeded_at: null,
    last_usage_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    meta: {},
    ...overrides,
  };
}

describe("AgentBudgetEditDialog", () => {
  let onOpenChange: ReturnType<typeof vi.fn>;
  let onSaved: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onOpenChange = vi.fn();
    onSaved = vi.fn();
  });

  it("renders when open=true", () => {
    render(
      <AgentBudgetEditDialog
        open={true}
        onOpenChange={onOpenChange}
        agentId="agent-1"
        current={makeBudget()}
        onSaved={onSaved}
      />
    );
    expect(screen.getByText("Edit budget")).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(
      <AgentBudgetEditDialog
        open={false}
        onOpenChange={onOpenChange}
        agentId="agent-1"
        current={makeBudget()}
        onSaved={onSaved}
      />
    );
    expect(screen.queryByText("Edit budget")).not.toBeInTheDocument();
  });

  it("populates fields from current budget", () => {
    render(
      <AgentBudgetEditDialog
        open={true}
        onOpenChange={onOpenChange}
        agentId="agent-1"
        current={makeBudget({ monthly_limit_usd: 100, soft_threshold_pct: 90 })}
        onSaved={onSaved}
      />
    );
    const limitInput = screen.getByPlaceholderText("No limit");
    expect(limitInput).toHaveValue("100");
  });

  it("save calls setAgentBudget with correct params", async () => {
    const user = userEvent.setup();
    render(
      <AgentBudgetEditDialog
        open={true}
        onOpenChange={onOpenChange}
        agentId="agent-1"
        current={makeBudget({ monthly_limit_usd: 50 })}
        onSaved={onSaved}
      />
    );
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(mockSetAgentBudget).toHaveBeenCalledWith({
        agentId: "agent-1",
        monthlyLimitUsd: 50,
        softThresholdPct: 80,
        hardCutoff: true,
      });
    });
  });

  it("shows error toast for invalid amounts", async () => {
    const user = userEvent.setup();
    render(
      <AgentBudgetEditDialog
        open={true}
        onOpenChange={onOpenChange}
        agentId="agent-1"
        current={null}
        onSaved={onSaved}
      />
    );
    const limitInput = screen.getByPlaceholderText("No limit");
    await user.type(limitInput, "abc");
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Enter a valid dollar amount or leave empty for no limit"
      );
    });
  });

  it("cancel calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    render(
      <AgentBudgetEditDialog
        open={true}
        onOpenChange={onOpenChange}
        agentId="agent-1"
        current={null}
        onSaved={onSaved}
      />
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
