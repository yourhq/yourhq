import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { StepInfrastructure } from "@/components/onboarding/wizard/step-infrastructure";
import type { StepInfrastructureProps } from "@/components/onboarding/wizard/step-infrastructure";

function makeProps(overrides?: Partial<StepInfrastructureProps>): StepInfrastructureProps {
  return {
    status: { db: "idle", gateway: "idle" },
    schemaInstall: { phase: "idle" },
    onValidateDb: vi.fn(),
    onRunOneClick: vi.fn(),
    onConfirmSchema: vi.fn(),
    onChooseGateway: vi.fn(),
    onContinue: vi.fn(),
    pending: false,
    ...overrides,
  };
}

describe("StepInfrastructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Heading and intro ────────────────────────────────────────────────────

  it("renders heading and description", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.getByText("Connect your database")).toBeInTheDocument();
    expect(screen.getByText(/nothing leaves your project/)).toBeInTheDocument();
  });

  // ─── Setup guide ─────────────────────────────────────────────────────────

  it("shows setup guide by default", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.getByText(/New to Supabase/)).toBeInTheDocument();
    expect(screen.getByText(/Sign up at supabase.com/)).toBeInTheDocument();
  });

  it("setup guide has three numbered steps", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("guide collapses when user clicks 'I have my project ready'", async () => {
    const user = userEvent.setup();
    render(<StepInfrastructure {...makeProps()} />);
    await user.click(screen.getByText(/I have my project ready/));
    expect(screen.queryByText(/New to Supabase/)).not.toBeInTheDocument();
    expect(screen.getByText(/Show setup guide/)).toBeInTheDocument();
  });

  it("collapsed guide can be re-expanded", async () => {
    const user = userEvent.setup();
    render(<StepInfrastructure {...makeProps()} />);
    await user.click(screen.getByText(/I have my project ready/));
    await user.click(screen.getByText(/Show setup guide/));
    expect(screen.getByText(/New to Supabase/)).toBeInTheDocument();
  });

  // ─── Database form ────────────────────────────────────────────────────────

  it("renders all three credential fields with updated labels", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.getByLabelText("Supabase publishable key")).toBeInTheDocument();
    expect(screen.getByLabelText("Supabase secret key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/supabase\.co/)).toBeInTheDocument();
  });

  it("shows publishable key placeholder with new format", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.getByPlaceholderText(/sb_publishable_/)).toBeInTheDocument();
  });

  it("shows secret key placeholder with new format", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.getByPlaceholderText(/sb_secret_/)).toBeInTheDocument();
  });

  it("mentions legacy key names for context", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.getByText(/anon key/)).toBeInTheDocument();
    expect(screen.getByText(/service role key/)).toBeInTheDocument();
  });

  it("connect button disabled when fields are empty", () => {
    render(<StepInfrastructure {...makeProps()} />);
    const btn = screen.getByRole("button", { name: /connect database/i });
    expect(btn).toBeDisabled();
  });

  it("connect button enabled when all fields filled", async () => {
    const user = userEvent.setup();
    render(<StepInfrastructure {...makeProps()} />);
    await user.type(screen.getByPlaceholderText(/supabase\.co/), "https://abc.supabase.co");
    await user.type(screen.getByLabelText("Supabase publishable key"), "sb_publishable_test123456789");
    await user.type(screen.getByLabelText("Supabase secret key"), "sb_secret_test123456789000");
    const btn = screen.getByRole("button", { name: /connect database/i });
    expect(btn).not.toBeDisabled();
  });

  it("calls onValidateDb with correct args on connect", async () => {
    const onValidateDb = vi.fn();
    const user = userEvent.setup();
    render(<StepInfrastructure {...makeProps({ onValidateDb })} />);
    await user.type(screen.getByPlaceholderText(/supabase\.co/), "https://abc.supabase.co");
    await user.type(screen.getByLabelText("Supabase publishable key"), "sb_publishable_key");
    await user.type(screen.getByLabelText("Supabase secret key"), "sb_secret_key");
    await user.click(screen.getByRole("button", { name: /connect database/i }));
    expect(onValidateDb).toHaveBeenCalledWith(
      "https://abc.supabase.co",
      "sb_publishable_key",
      "sb_secret_key",
    );
  });

  it("shows connecting state during validation", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "validating", gateway: "idle" } })}
      />,
    );
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  // ─── Project ref extraction and deep links ────────────────────────────────

  it("extracts project ref from valid Supabase URL", async () => {
    const user = userEvent.setup();
    render(<StepInfrastructure {...makeProps()} />);
    await user.type(screen.getByPlaceholderText(/supabase\.co/), "https://abcdefghij.supabase.co");
    expect(screen.getByText("abcdefghij")).toBeInTheDocument();
  });

  it("shows direct link to API Keys page when URL is entered and keys are empty", async () => {
    const user = userEvent.setup();
    render(<StepInfrastructure {...makeProps()} />);
    await user.type(screen.getByPlaceholderText(/supabase\.co/), "https://abcdefghij.supabase.co");
    const link = screen.getByText(/Open your API Keys page/);
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute(
      "href",
      "https://supabase.com/dashboard/project/abcdefghij/settings/api-keys",
    );
  });

  it("hides API Keys link once keys are entered", async () => {
    const user = userEvent.setup();
    render(<StepInfrastructure {...makeProps()} />);
    await user.type(screen.getByPlaceholderText(/supabase\.co/), "https://abcdefghij.supabase.co");
    expect(screen.getByText(/Open your API Keys page/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Supabase publishable key"), "sb_publishable_x");
    expect(screen.queryByText(/Open your API Keys page/)).not.toBeInTheDocument();
  });

  // ─── Database connected state ─────────────────────────────────────────────

  it("shows success badge when DB is connected", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "idle" } })}
      />,
    );
    expect(screen.getByText("Connected to Supabase")).toBeInTheDocument();
  });

  it("hides form when DB is connected", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "idle" } })}
      />,
    );
    expect(screen.queryByLabelText("Supabase publishable key")).not.toBeInTheDocument();
  });

  // ─── Error state ──────────────────────────────────────────────────────────

  it("shows error when DB validation fails", () => {
    render(
      <StepInfrastructure
        {...makeProps({
          status: { db: "error", dbError: "Secret key rejected by Supabase.", gateway: "idle" },
        })}
      />,
    );
    expect(screen.getByText("Secret key rejected by Supabase.")).toBeInTheDocument();
  });

  // ─── Gateway section ──────────────────────────────────────────────────────

  it("gateway section hidden when DB not connected", () => {
    render(<StepInfrastructure {...makeProps()} />);
    expect(screen.queryByText("Agent runtime")).not.toBeInTheDocument();
  });

  it("gateway section visible after DB connects", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "idle" } })}
      />,
    );
    expect(screen.getByText("Agent runtime")).toBeInTheDocument();
  });

  it("gateway section has runtime explanation", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "idle" } })}
      />,
    );
    expect(screen.getByText(/where your AI agents actually run/)).toBeInTheDocument();
  });

  it("gateway options show descriptions", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "idle" } })}
      />,
    );
    expect(screen.getByText(/Runs via Docker/)).toBeInTheDocument();
    expect(screen.getByText(/always-on agents/)).toBeInTheDocument();
  });

  it("calls onChooseGateway when local is selected", async () => {
    const onChooseGateway = vi.fn();
    const user = userEvent.setup();
    render(
      <StepInfrastructure
        {...makeProps({
          status: { db: "connected", gateway: "idle" },
          onChooseGateway,
        })}
      />,
    );
    await user.click(screen.getByText("This machine"));
    expect(onChooseGateway).toHaveBeenCalledWith("local");
  });

  it("calls onChooseGateway when remote is selected", async () => {
    const onChooseGateway = vi.fn();
    const user = userEvent.setup();
    render(
      <StepInfrastructure
        {...makeProps({
          status: { db: "connected", gateway: "idle" },
          onChooseGateway,
        })}
      />,
    );
    await user.click(screen.getByText("Remote server"));
    expect(onChooseGateway).toHaveBeenCalledWith("remote");
  });

  it("shows gateway connected state", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "connected" } })}
      />,
    );
    expect(screen.getByText("Agent runtime connected")).toBeInTheDocument();
  });

  // ─── Continue button ──────────────────────────────────────────────────────

  it("continue button hidden until both DB and gateway connected", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "idle" } })}
      />,
    );
    expect(screen.queryByRole("button", { name: /^continue$/i })).not.toBeInTheDocument();
  });

  it("continue button appears when both connected", () => {
    render(
      <StepInfrastructure
        {...makeProps({ status: { db: "connected", gateway: "connected" } })}
      />,
    );
    const btn = screen.getByRole("button", { name: /^continue$/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it("calls onContinue when continue clicked", async () => {
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(
      <StepInfrastructure
        {...makeProps({
          status: { db: "connected", gateway: "connected" },
          onContinue,
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalled();
  });

  // ─── Schema install panel ────────────────────────────────────────────────

  it("shows schema install panel when schema is needed", () => {
    render(
      <StepInfrastructure
        {...makeProps({
          status: { db: "schema-needed", gateway: "idle" },
          schemaInstall: { phase: "needed" },
        })}
      />,
    );
    expect(screen.getByText(/Your database needs HQ/)).toBeInTheDocument();
    expect(screen.getByText("Automatic install")).toBeInTheDocument();
    expect(screen.getByText("Manual SQL")).toBeInTheDocument();
  });
});
