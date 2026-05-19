import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/lib/setup/templates", () => ({
  CONTEXT_PRESETS: [
    {
      key: "reach",
      label: "Find & reach people",
      description: "Cold outreach.",
      emoji: "🚀",
      pipelineKey: "outreach",
      fieldKey: "creator-outreach",
      streamNames: [],
      modules: { crm: true },
      collectionTemplateSlugs: [],
    },
  ],
}));

vi.mock("@/lib/connections/types", () => ({
  PROVIDER_CATALOG: [
    {
      id: "anthropic",
      displayName: "Anthropic",
      description: "Claude models",
      authShape: "api_key",
    },
    {
      id: "openai-codex",
      displayName: "OpenAI Codex",
      description: "ChatGPT login",
      authShape: "oauth_paste",
    },
  ],
}));

const mockCreateHostedCheckout = vi.fn();
const mockPollProvisionStatus = vi.fn();
const mockVerifyAndKickProvision = vi.fn();
const mockRetryProvisionAction = vi.fn();
const mockVerifyAutoLogin = vi.fn();
const mockGetHostedEmail = vi.fn();
const mockSendFreshLoginLink = vi.fn();

vi.mock("@/components/onboarding/wizard/hosted-actions", () => ({
  createHostedCheckout: (...args: unknown[]) => mockCreateHostedCheckout(...args),
  pollProvisionStatus: (...args: unknown[]) => mockPollProvisionStatus(...args),
  verifyAndKickProvision: (...args: unknown[]) => mockVerifyAndKickProvision(...args),
  retryProvisionAction: (...args: unknown[]) => mockRetryProvisionAction(...args),
  verifyAutoLogin: (...args: unknown[]) => mockVerifyAutoLogin(...args),
  getHostedEmail: (...args: unknown[]) => mockGetHostedEmail(...args),
  sendFreshLoginLink: (...args: unknown[]) => mockSendFreshLoginLink(...args),
}));

const mockConnectProvider = vi.fn();
const mockCreateFirstAgent = vi.fn();
const mockPollAgentProvisionStatus = vi.fn();
const mockStartOAuthFlow = vi.fn();
const mockSubmitOAuthPaste = vi.fn();
const mockPollCommandState = vi.fn();
const mockSaveOAuthProvider = vi.fn();

vi.mock("@/components/onboarding/wizard/actions", () => ({
  connectProvider: (...args: unknown[]) => mockConnectProvider(...args),
  createFirstAgent: (...args: unknown[]) => mockCreateFirstAgent(...args),
  pollAgentProvisionStatus: (...args: unknown[]) => mockPollAgentProvisionStatus(...args),
  startOAuthFlow: (...args: unknown[]) => mockStartOAuthFlow(...args),
  submitOAuthPaste: (...args: unknown[]) => mockSubmitOAuthPaste(...args),
  pollCommandState: (...args: unknown[]) => mockPollCommandState(...args),
  saveOAuthProvider: (...args: unknown[]) => mockSaveOAuthProvider(...args),
}));

import { StepLaunch } from "@/components/onboarding/wizard/step-launch";
import type { StepLaunchProps } from "@/components/onboarding/wizard/step-launch";

function makeProps(overrides?: Partial<StepLaunchProps>): StepLaunchProps {
  return {
    ownerName: "Alice",
    workspaceName: "Alice's HQ",
    intentKey: "reach",
    email: "alice@example.com",
    providerId: "anthropic",
    providerApiKey: "sk-ant-test-key",
    agentName: "Scout",
    agentEmoji: "🕵️",
    agentTemplateBranch: "template/scout",
    onComplete: vi.fn(),
    onPatch: vi.fn(),
    ...overrides,
  };
}

describe("StepLaunch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHostedCheckout.mockResolvedValue({
      workspaceId: "ws-1",
      url: "https://checkout.stripe.com/test",
    });
  });

  // ─── Summary phase ─────────────────────────────────────────────────────────

  describe("summary phase", () => {
    it("renders agent emoji and personalized heading", () => {
      render(<StepLaunch {...makeProps()} />);
      expect(screen.getByText("🕵️")).toBeInTheDocument();
      expect(screen.getByText("Scout is ready to start")).toBeInTheDocument();
    });

    it("shows provider name in description and summary", () => {
      render(<StepLaunch {...makeProps()} />);
      const matches = screen.getAllByText(/Anthropic/);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it("renders all four value proposition items", () => {
      render(<StepLaunch {...makeProps()} />);
      expect(screen.getByText("Unlimited AI employees")).toBeInTheDocument();
      expect(screen.getByText("Autonomous web browsing")).toBeInTheDocument();
      expect(screen.getByText("Knowledge base & skills")).toBeInTheDocument();
      expect(screen.getByText("Task management & routines")).toBeInTheDocument();
    });

    it("renders compact summary with workspace name", () => {
      render(<StepLaunch {...makeProps()} />);
      expect(screen.getByText("Alice's HQ")).toBeInTheDocument();
    });

    it("renders compact summary with focus preset", () => {
      render(<StepLaunch {...makeProps()} />);
      expect(screen.getByText(/Find & reach people/)).toBeInTheDocument();
    });

    it("renders compact summary with AI provider", () => {
      render(<StepLaunch {...makeProps()} />);
      const aiLabels = screen.getAllByText("Anthropic");
      expect(aiLabels.length).toBeGreaterThanOrEqual(1);
    });

    it("does not show focus row when intentKey has no matching preset", () => {
      render(<StepLaunch {...makeProps({ intentKey: "unknown" })} />);
      expect(screen.queryByText("Focus")).not.toBeInTheDocument();
    });

    it("renders launch button with workspace name", () => {
      render(<StepLaunch {...makeProps()} />);
      expect(
        screen.getByRole("button", { name: /Launch Alice's HQ/i }),
      ).toBeInTheDocument();
    });

    it("renders price display", () => {
      render(<StepLaunch {...makeProps()} />);
      expect(screen.getByText("$30")).toBeInTheDocument();
      expect(screen.getByText("/month")).toBeInTheDocument();
    });

    it("renders trust signals", () => {
      render(<StepLaunch {...makeProps()} />);
      expect(screen.getByText(/Secure checkout via Stripe/)).toBeInTheDocument();
      expect(screen.getByText("Cancel anytime")).toBeInTheDocument();
      expect(screen.getByText("No contracts")).toBeInTheDocument();
    });

    it("shows loading state when checkout is initiated", async () => {
      mockCreateHostedCheckout.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      render(<StepLaunch {...makeProps()} />);
      await user.click(screen.getByRole("button", { name: /Launch/i }));
      expect(screen.getByText(/Redirecting to Stripe/)).toBeInTheDocument();
    });

    it("calls createHostedCheckout with correct params on click", async () => {
      const onPatch = vi.fn();
      mockCreateHostedCheckout.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      render(<StepLaunch {...makeProps({ onPatch })} />);
      await user.click(screen.getByRole("button", { name: /Launch/i }));
      expect(mockCreateHostedCheckout).toHaveBeenCalledWith({
        email: "alice@example.com",
        ownerName: "Alice",
        workspaceLabel: "Alice's HQ",
        workspaceEmoji: "🏠",
        contextPreset: "reach",
      });
    });

    it("shows error when checkout fails", async () => {
      mockCreateHostedCheckout.mockRejectedValue(new Error("Payment failed"));
      const user = userEvent.setup();
      render(<StepLaunch {...makeProps()} />);
      await user.click(screen.getByRole("button", { name: /Launch/i }));
      await waitFor(() => {
        expect(screen.getByText("Payment failed")).toBeInTheDocument();
      });
    });

    it("disables button during loading", async () => {
      mockCreateHostedCheckout.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();
      render(<StepLaunch {...makeProps()} />);
      const btn = screen.getByRole("button", { name: /Launch/i });
      await user.click(btn);
      expect(btn).toBeDisabled();
    });

    it("falls back to 'your AI provider' when provider not in catalog", () => {
      render(<StepLaunch {...makeProps({ providerId: "unknown-provider" })} />);
      expect(screen.getByText(/your AI provider/)).toBeInTheDocument();
    });
  });

  // ─── Provisioning phase ─────────────────────────────────────────────────────

  describe("provisioning phase", () => {
    it("renders provisioning UI when resumeAtProvisioning is true", () => {
      render(
        <StepLaunch
          {...makeProps({
            hostedWorkspaceId: "ws-1",
            resumeAtProvisioning: true,
          })}
        />,
      );
      expect(screen.getByText("Confirming payment")).toBeInTheDocument();
    });

    it("shows pending payment message when subscription is pending", async () => {
      mockPollProvisionStatus.mockResolvedValue({
        subscription_status: "pending",
        provision_stage: null,
        provision_error: null,
        auto_login_token_hash: null,
        auto_login_type: "magiclink",
      });
      render(
        <StepLaunch
          {...makeProps({
            hostedWorkspaceId: "ws-1",
            resumeAtProvisioning: true,
          })}
        />,
      );
      await waitFor(() => {
        expect(
          screen.getAllByText(/Waiting for payment confirmation/).length,
        ).toBeGreaterThanOrEqual(1);
      });
    });

    it("shows provision stage list during active provisioning", async () => {
      mockPollProvisionStatus.mockResolvedValue({
        subscription_status: "active",
        provision_stage: "applying_schema",
        provision_error: null,
        auto_login_token_hash: null,
        auto_login_type: "magiclink",
      });
      render(
        <StepLaunch
          {...makeProps({
            hostedWorkspaceId: "ws-1",
            resumeAtProvisioning: true,
          })}
        />,
      );
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Setting up your workspace" })).toBeInTheDocument();
      });
      expect(screen.getByText("Creating database")).toBeInTheDocument();
      expect(screen.getByText("Applying schema")).toBeInTheDocument();
      expect(screen.getByText("Starting agent runtime")).toBeInTheDocument();
    });

    it("shows error state with retry button on provision failure", async () => {
      mockPollProvisionStatus.mockResolvedValue({
        subscription_status: "active",
        provision_stage: "creating_project",
        provision_error: "project creation failed",
        auto_login_token_hash: null,
        auto_login_type: "magiclink",
      });
      mockRetryProvisionAction.mockResolvedValue({ ok: true });
      render(
        <StepLaunch
          {...makeProps({
            hostedWorkspaceId: "ws-1",
            resumeAtProvisioning: true,
          })}
        />,
      );
      await waitFor(() => {
        expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      });
      expect(
        screen.getByText(
          "We couldn't create your database right now. Our team has been notified.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /try again/i }),
      ).toBeInTheDocument();
    });

    it("retry button calls retryProvisionAction", async () => {
      mockPollProvisionStatus.mockResolvedValue({
        subscription_status: "active",
        provision_stage: "creating_project",
        provision_error: "project creation failed",
        auto_login_token_hash: null,
        auto_login_type: "magiclink",
      });
      mockRetryProvisionAction.mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      render(
        <StepLaunch
          {...makeProps({
            hostedWorkspaceId: "ws-1",
            resumeAtProvisioning: true,
          })}
        />,
      );
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /try again/i }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /try again/i }));
      expect(mockRetryProvisionAction).toHaveBeenCalledWith("ws-1");
    });
  });

  // ─── Provider connection phase ──────────────────────────────────────────────

  describe("provider connection (OAuth)", () => {
    it("shows OAuth sign-in button for OAuth providers", async () => {
      mockPollProvisionStatus.mockResolvedValue({
        subscription_status: "active",
        provision_stage: "complete",
        provision_error: null,
        auto_login_token_hash: null,
        auto_login_type: "magiclink",
      });
      render(
        <StepLaunch
          {...makeProps({
            providerId: "openai-codex",
            providerApiKey: "",
            hostedWorkspaceId: "ws-1",
            resumeAtProvisioning: true,
          })}
        />,
      );
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /sign in with openai codex/i }),
        ).toBeInTheDocument();
      });
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("renders with all optional fields missing from preset", () => {
      render(
        <StepLaunch
          {...makeProps({
            intentKey: "nonexistent",
            providerId: "nonexistent",
          })}
        />,
      );
      expect(screen.getByText("Scout is ready to start")).toBeInTheDocument();
      expect(screen.queryByText("Focus")).not.toBeInTheDocument();
      expect(screen.queryByText("AI")).not.toBeInTheDocument();
    });

    it("uses different agent name and emoji in heading", () => {
      render(
        <StepLaunch
          {...makeProps({ agentName: "Writer", agentEmoji: "✍️" })}
        />,
      );
      expect(screen.getByText("Writer is ready to start")).toBeInTheDocument();
      expect(screen.getByText("✍️")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Launch Alice's HQ/i }),
      ).toBeInTheDocument();
    });

    it("shows support email in provisioning error", async () => {
      mockPollProvisionStatus.mockResolvedValue({
        subscription_status: "active",
        provision_stage: "starting_sandbox",
        provision_error: "setup failed",
        auto_login_token_hash: null,
        auto_login_type: "magiclink",
      });
      render(
        <StepLaunch
          {...makeProps({
            hostedWorkspaceId: "ws-1",
            resumeAtProvisioning: true,
          })}
        />,
      );
      await waitFor(() => {
        expect(
          screen.getByText(/support@yourhq.ai/),
        ).toBeInTheDocument();
      });
    });
  });
});
