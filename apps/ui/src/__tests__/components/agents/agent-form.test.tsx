import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Agent } from "@/lib/agents/types";
import { buildAgent, resetAgentCounter } from "../../helpers/factories";

// ── Mocks ───────────────────────────────────────────────────────────

const mockSupabaseUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const mockSupabaseFrom = vi.fn().mockReturnValue({
  update: mockSupabaseUpdate,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/app/dashboard/agents/actions", () => ({
  createAgentWithBranch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({
    children,
    open,
    onOpenChange: _onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  ResponsiveDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock("@/components/ui/tag-input", () => ({
  TagInput: ({
    value,
    onChange: _onChange,
    placeholder,
  }: {
    value: string[];
    onChange: (v: string[]) => void;
    placeholder?: string;
  }) => <input data-testid="tag-input" placeholder={placeholder} readOnly value={value.join(",")} />,
}));

import { AgentForm } from "@/components/agents/agent-form";

// ── Helpers ─────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return buildAgent({
    id: "agent-form-1",
    name: "Existing Agent",
    slug: "existing-agent",
    description: "Old description",
    domains: ["crm"],
    capabilities: ["research"],
    ...overrides,
  });
}

describe("AgentForm", () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAgentCounter();
    onSave = vi.fn();
    onCancel = vi.fn();
  });

  it("renders 'Register agent' title for new agent", () => {
    render(<AgentForm editingAgent={null} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Register agent")).toBeInTheDocument();
  });

  it("renders 'Edit agent' title when editingAgent provided", () => {
    render(<AgentForm editingAgent={makeAgent()} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Edit agent")).toBeInTheDocument();
  });

  it("name and slug fields are visible", () => {
    render(<AgentForm editingAgent={null} onSave={onSave} onCancel={onCancel} />);
    const nameInput = screen.getByPlaceholderText("What agent are you registering?");
    expect(nameInput).toBeInTheDocument();
    const slugInput = screen.getByPlaceholderText("auto-generated");
    expect(slugInput).toBeInTheDocument();
  });

  it("slug auto-generates from name for new agent", async () => {
    const user = userEvent.setup();
    render(<AgentForm editingAgent={null} onSave={onSave} onCancel={onCancel} />);
    const nameInput = screen.getByPlaceholderText("What agent are you registering?");
    await user.type(nameInput, "My New Agent");
    const slugInput = screen.getByPlaceholderText("auto-generated");
    expect(slugInput).toHaveValue("my-new-agent");
  });

  it("save button disabled when name is empty", () => {
    render(<AgentForm editingAgent={null} onSave={onSave} onCancel={onCancel} />);
    const registerBtn = screen.getByRole("button", { name: "Register" });
    expect(registerBtn).toBeDisabled();
  });

  it("submit calls supabase update for edit mode", async () => {
    const user = userEvent.setup();
    const agent = makeAgent();
    render(<AgentForm editingAgent={agent} onSave={onSave} onCancel={onCancel} />);
    const saveBtn = screen.getByRole("button", { name: "Save" });
    await user.click(saveBtn);
    await waitFor(() => {
      expect(mockSupabaseFrom).toHaveBeenCalledWith("agents");
    });
  });

  it("cancel calls onCancel", async () => {
    const user = userEvent.setup();
    render(<AgentForm editingAgent={null} onSave={onSave} onCancel={onCancel} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows description expand button for new agent", () => {
    render(<AgentForm editingAgent={null} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByText("Add description...")).toBeInTheDocument();
  });
});
