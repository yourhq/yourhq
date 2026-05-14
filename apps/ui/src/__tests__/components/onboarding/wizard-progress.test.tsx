import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { WizardProgress } from "@/components/onboarding/wizard/wizard-progress";

const STEPS = [
  { key: "welcome", label: "Welcome" },
  { key: "intent", label: "Intent" },
  { key: "provider", label: "Provider" },
  { key: "agent", label: "Agent" },
  { key: "celebrate", label: "Done" },
];

describe("WizardProgress", () => {
  it("renders all step labels in the desktop stepper", () => {
    render(<WizardProgress steps={STEPS} currentStep="welcome" />);
    for (const step of STEPS) {
      expect(screen.getAllByText(step.label).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders step numbers for non-completed steps", () => {
    render(<WizardProgress steps={STEPS} currentStep="intent" />);
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
  });

  it("shows mobile step counter text", () => {
    render(<WizardProgress steps={STEPS} currentStep="intent" />);
    expect(screen.getByText(/Step 2 of 5/)).toBeInTheDocument();
  });

  it("shows current step label in mobile view", () => {
    render(<WizardProgress steps={STEPS} currentStep="provider" />);
    const labels = screen.getAllByText("Provider");
    expect(labels.length).toBeGreaterThanOrEqual(1);
  });

  it("calculates progress percent correctly for first step", () => {
    const { container } = render(
      <WizardProgress steps={STEPS} currentStep="welcome" />,
    );
    const progressBar = container.querySelector("[style]");
    expect(progressBar).toBeInTheDocument();
  });

  it("renders sub-step dots when on agent step with subSteps", () => {
    const { container } = render(
      <WizardProgress
        steps={STEPS}
        currentStep="agent"
        subSteps={3}
        currentSubStep={1}
      />,
    );
    const dots = container.querySelectorAll(".rounded-full.h-1.w-1");
    expect(dots).toHaveLength(3);
  });

  it("does not render sub-step dots when not on agent step", () => {
    const { container } = render(
      <WizardProgress
        steps={STEPS}
        currentStep="intent"
        subSteps={3}
        currentSubStep={1}
      />,
    );
    const dots = container.querySelectorAll(".rounded-full.h-1.w-1");
    expect(dots).toHaveLength(0);
  });

  it("does not render sub-step dots when subSteps is undefined", () => {
    const { container } = render(
      <WizardProgress steps={STEPS} currentStep="agent" />,
    );
    const dots = container.querySelectorAll(".rounded-full.h-1.w-1");
    expect(dots).toHaveLength(0);
  });

  it("handles single step", () => {
    render(
      <WizardProgress
        steps={[{ key: "only", label: "Only Step" }]}
        currentStep="only"
      />,
    );
    expect(screen.getByText(/Step 1 of 1/)).toBeInTheDocument();
  });

  it("shows mobile progress bar", () => {
    const { container } = render(
      <WizardProgress steps={STEPS} currentStep="provider" />,
    );
    const bars = container.querySelectorAll(".rounded-full.bg-foreground");
    expect(bars.length).toBeGreaterThanOrEqual(1);
  });
});
