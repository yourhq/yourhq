import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import {
  OAuthInteractiveFlow,
  type OAuthFlowContext,
} from "@/components/connections/oauth-interactive-flow";
import type { ConnectionCommandState } from "@/lib/connections/types";

const defaultContext: OAuthFlowContext = {
  providerDisplayName: "OpenAI",
  mode: "oauth_paste",
  autoCallback: false,
};

const autoCallbackContext: OAuthFlowContext = {
  providerDisplayName: "OpenAI",
  mode: "oauth_paste",
  autoCallback: true,
};

const deviceCodeContext: OAuthFlowContext = {
  providerDisplayName: "GitHub",
  mode: "device_code",
};

describe("OAuthInteractiveFlow", () => {
  const onPaste = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Starting stage ────────────────────────────────────────────────

  it("shows preparing spinner in starting stage", () => {
    render(
      <OAuthInteractiveFlow
        state={{ stage: "starting" }}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/Preparing sign-in/)).toBeInTheDocument();
  });

  it("shows guidance for oauth_paste mode in starting stage", () => {
    render(
      <OAuthInteractiveFlow
        state={{ stage: "starting" }}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/full URL/)).toBeInTheDocument();
  });

  it("shows guidance for device_code mode", () => {
    render(
      <OAuthInteractiveFlow
        state={{ stage: "starting" }}
        context={deviceCodeContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/short code/)).toBeInTheDocument();
  });

  it("shows autoCallback guidance mentioning fallback", () => {
    render(
      <OAuthInteractiveFlow
        state={{ stage: "starting" }}
        context={autoCallbackContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/paste the redirect URL manually/)).toBeInTheDocument();
  });

  // ─── URL ready stage ───────────────────────────────────────────────

  it("shows URL and open button when url_ready", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByDisplayValue("https://auth.openai.com/start")).toBeInTheDocument();
    expect(screen.getByText("Open in browser")).toBeInTheDocument();
  });

  it("shows paste input for non-autoCallback oauth_paste", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByPlaceholderText(/localhost:1455/)).toBeInTheDocument();
    expect(screen.getByText("Submit")).toBeInTheDocument();
  });

  it("shows dead redirect hint for non-autoCallback paste flow", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/page that won't load/)).toBeInTheDocument();
  });

  // ─── Verification code (device_code) ──────────────────────────────

  it("shows verification code for device_code flow", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://github.com/login/device",
      verificationCode: "ABCD-1234",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={deviceCodeContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
    expect(screen.getByText(/enter this code/)).toBeInTheDocument();
  });

  it("shows waiting for approval in device_code mode", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://github.com/login/device",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={deviceCodeContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/Waiting for you to approve/)).toBeInTheDocument();
  });

  // ─── Auto-callback: initial waiting ────────────────────────────────

  it("shows waiting spinner for autoCallback initially", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
      autoCallback: true,
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={autoCallbackContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/Waiting for sign-in to complete/)).toBeInTheDocument();
    expect(screen.getByText(/close automatically/)).toBeInTheDocument();
  });

  it("does not show paste input for autoCallback before timeout", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
      autoCallback: true,
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={autoCallbackContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.queryByPlaceholderText(/localhost:1455/)).not.toBeInTheDocument();
  });

  // ─── Auto-callback: fallback after timeout ─────────────────────────

  it("shows fallback paste UI after 15 seconds for autoCallback", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
      autoCallback: true,
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={autoCallbackContext}
        onPaste={onPaste}
      />,
    );

    expect(screen.queryByText(/Sign-in not detected/)).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText(/Sign-in not detected automatically/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/localhost:1455/)).toBeInTheDocument();
  });

  it("explains 404 page in autoCallback fallback", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
      autoCallback: true,
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={autoCallbackContext}
        onPaste={onPaste}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText(/shows a 404/)).toBeInTheDocument();
  });

  it("shows hide paste field button in autoCallback fallback", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
      autoCallback: true,
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={autoCallbackContext}
        onPaste={onPaste}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(screen.getByText(/hide paste field/)).toBeInTheDocument();
  });

  it("submits pasted URL in autoCallback fallback", async () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
      autoCallback: true,
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={autoCallbackContext}
        onPaste={onPaste}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    vi.useRealTimers();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/localhost:1455/);
    await user.type(input, "http://localhost:1455/callback?code=abc123");
    await user.click(screen.getByText("Submit"));

    expect(onPaste).toHaveBeenCalledWith(
      "http://localhost:1455/callback?code=abc123",
    );
  });

  // ─── Paste submission (non-autoCallback) ───────────────────────────

  it("calls onPaste with trimmed value on submit click", async () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );

    vi.useRealTimers();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/localhost:1455/);
    await user.type(input, "  http://localhost:1455/callback?code=xyz  ");
    await user.click(screen.getByText("Submit"));

    expect(onPaste).toHaveBeenCalledWith(
      "http://localhost:1455/callback?code=xyz",
    );
  });

  it("calls onPaste on Enter key in paste input", async () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );

    vi.useRealTimers();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/localhost:1455/);
    await user.type(input, "http://localhost:1455/callback?code=xyz{Enter}");

    expect(onPaste).toHaveBeenCalledWith(
      "http://localhost:1455/callback?code=xyz",
    );
  });

  it("disables submit button when paste input is empty", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    const btn = screen.getByText("Submit");
    expect(btn).toBeDisabled();
  });

  // ─── Completed / Failed ────────────────────────────────────────────

  it("shows success message on completed stage", () => {
    const state: ConnectionCommandState = {
      stage: "completed",
      profileId: "p-1",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText(/Signed in/)).toBeInTheDocument();
  });

  it("shows error message on failed stage", () => {
    const state: ConnectionCommandState = {
      stage: "failed",
      error: "Token expired",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText("Token expired")).toBeInTheDocument();
  });

  it("shows generic error when failed stage has no message", () => {
    const state: ConnectionCommandState = {
      stage: "failed",
      error: "",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );
    expect(screen.getByText("Sign-in failed.")).toBeInTheDocument();
  });

  it("shows error prop when not in failed stage", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
        error="Network error"
      />,
    );
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  // ─── Verifying state ──────────────────────────────────────────────

  it("shows verifying spinner after paste submission", async () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    const { rerender } = render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );

    vi.useRealTimers();
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/localhost:1455/);
    await user.type(input, "http://localhost:1455/callback?code=abc");
    await user.click(screen.getByText("Submit"));

    rerender(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
      />,
    );

    expect(screen.getByText(/Verifying credentials/)).toBeInTheDocument();
  });

  // ─── submittingPaste prop ─────────────────────────────────────────

  it("disables submit button when submittingPaste is true", () => {
    const state: ConnectionCommandState = {
      stage: "url_ready",
      url: "https://auth.openai.com/start",
    };
    const { container } = render(
      <OAuthInteractiveFlow
        state={state}
        context={defaultContext}
        onPaste={onPaste}
        submittingPaste
      />,
    );
    const buttons = container.querySelectorAll("button[disabled]");
    const submitArea = Array.from(buttons).find((btn) =>
      btn.classList.contains("shrink-0"),
    );
    expect(submitArea).toBeTruthy();
  });
});
