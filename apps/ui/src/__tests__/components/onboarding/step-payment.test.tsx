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

import { StepPayment } from "@/components/onboarding/wizard/step-payment";

describe("StepPayment", () => {
  const onCheckout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onCheckout.mockResolvedValue(undefined);
  });

  it("renders the heading", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.getByText("Activate your workspace")).toBeInTheDocument();
  });

  it("renders workspace name in summary", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.getByText("Alice's HQ")).toBeInTheDocument();
  });

  it("renders email in summary", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("renders the preset focus when intentKey matches", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.getByText(/Find & reach people/)).toBeInTheDocument();
  });

  it("does not show focus row when intentKey does not match any preset", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="nonexistent"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.queryByText("Focus")).not.toBeInTheDocument();
  });

  it("renders the plan and price", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.getByText(/Pro/)).toBeInTheDocument();
    expect(screen.getByText(/\$30\/mo/)).toBeInTheDocument();
  });

  it("renders the checkout button", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: /continue to payment/i }),
    ).toBeInTheDocument();
  });

  it("calls onCheckout with email when button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /continue to payment/i }),
    );
    expect(onCheckout).toHaveBeenCalledWith("alice@example.com");
  });

  it("shows loading text while checkout is in progress", async () => {
    onCheckout.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /continue to payment/i }),
    );
    expect(screen.getByText(/Redirecting to Stripe/)).toBeInTheDocument();
  });

  it("shows error message when checkout fails", async () => {
    onCheckout.mockRejectedValue(new Error("Card declined"));
    const user = userEvent.setup();
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /continue to payment/i }),
    );
    await waitFor(() => {
      expect(screen.getByText("Card declined")).toBeInTheDocument();
    });
  });

  it("disables button when pending prop is true", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={true}
      />,
    );
    const btn = screen.getByRole("button", { name: /redirecting to stripe/i });
    expect(btn).toBeDisabled();
  });

  it("shows Stripe security note", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel="Alice's HQ"
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.getByText(/Secure payment via Stripe/)).toBeInTheDocument();
  });

  it("falls back to My Workspace when workspaceLabel is empty", () => {
    render(
      <StepPayment
        ownerName="Alice"
        workspaceLabel=""
        intentKey="reach"
        email="alice@example.com"
        onCheckout={onCheckout}
        pending={false}
      />,
    );
    expect(screen.getByText("My Workspace")).toBeInTheDocument();
  });
});
