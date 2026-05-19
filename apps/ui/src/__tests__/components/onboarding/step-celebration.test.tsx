import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StepCelebration } from "@/components/onboarding/wizard/step-celebration";

describe("StepCelebration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the animated checkmark SVG immediately", () => {
    const onContinue = vi.fn();
    const { container } = render(<StepCelebration onContinue={onContinue} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not show welcome text initially", () => {
    const onContinue = vi.fn();
    render(<StepCelebration onContinue={onContinue} />);
    expect(screen.queryByText(/welcome to/i)).not.toBeInTheDocument();
  });

  it("shows welcome text after 300ms", () => {
    const onContinue = vi.fn();
    render(<StepCelebration onContinue={onContinue} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(/Welcome to your workspace/)).toBeInTheDocument();
  });

  it("shows workspace name when provided", () => {
    const onContinue = vi.fn();
    render(
      <StepCelebration
        workspaceName="Acme Corp"
        onContinue={onContinue}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Welcome to Acme Corp")).toBeInTheDocument();
  });

  it("shows agent info when agentName is provided", () => {
    const onContinue = vi.fn();
    render(
      <StepCelebration
        agentName="Scout"
        agentEmoji="🕵️"
        onContinue={onContinue}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(/Scout is ready to help/)).toBeInTheDocument();
    expect(screen.getByText("🕵️")).toBeInTheDocument();
  });

  it("does not show agent info when agentName is not provided", () => {
    const onContinue = vi.fn();
    render(<StepCelebration onContinue={onContinue} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText(/is ready to help/)).not.toBeInTheDocument();
  });

  it("auto-continues after 3000ms", () => {
    const onContinue = vi.fn();
    render(<StepCelebration onContinue={onContinue} />);
    expect(onContinue).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("renders Go to dashboard button after content shows", () => {
    const onContinue = vi.fn();
    render(<StepCelebration onContinue={onContinue} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(
      screen.getByRole("button", { name: /go to dashboard/i }),
    ).toBeInTheDocument();
  });

  it("calls onContinue when Go to dashboard is clicked", async () => {
    const onContinue = vi.fn();
    render(<StepCelebration onContinue={onContinue} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /go to dashboard/i }),
    );
    expect(onContinue).toHaveBeenCalled();
  });

  it("clears timers on unmount", () => {
    const onContinue = vi.fn();
    const { unmount } = render(
      <StepCelebration onContinue={onContinue} />,
    );
    unmount();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onContinue).not.toHaveBeenCalled();
  });
});
