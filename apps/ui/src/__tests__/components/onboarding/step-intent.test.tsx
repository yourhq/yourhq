import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/lib/setup/templates", () => ({
  CONTEXT_PRESETS: [
    {
      key: "reach",
      label: "Find & reach people",
      description: "Cold outreach, content partnerships.",
      emoji: "🚀",
      pipelineKey: "outreach",
      fieldKey: "creator-outreach",
      streamNames: [],
      modules: { crm: true },
      collectionTemplateSlugs: [],
    },
    {
      key: "deals",
      label: "Close deals",
      description: "Deal flow, follow-ups.",
      emoji: "💸",
      pipelineKey: "sales",
      fieldKey: "sales",
      streamNames: [],
      modules: { crm: true },
      collectionTemplateSlugs: [],
    },
    {
      key: "explore",
      label: "Something else",
      description: "Start blank.",
      emoji: "✏️",
      pipelineKey: "custom",
      fieldKey: "blank",
      streamNames: [],
      modules: { crm: true },
      collectionTemplateSlugs: [],
    },
  ],
}));

import { StepIntent } from "@/components/onboarding/wizard/step-intent";

describe("StepIntent", () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading with first name", () => {
    render(
      <StepIntent ownerName="Alice Smith" onSubmit={onSubmit} pending={false} />,
    );
    expect(
      screen.getByText(/What do you need help with, Alice\?/),
    ).toBeInTheDocument();
  });

  it("falls back to 'there' when name is empty", () => {
    render(
      <StepIntent ownerName="" onSubmit={onSubmit} pending={false} />,
    );
    expect(
      screen.getByText(/What do you need help with, there\?/),
    ).toBeInTheDocument();
  });

  it("renders intent cards", () => {
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    expect(screen.getByText("Find & reach people")).toBeInTheDocument();
    expect(screen.getByText("Close deals")).toBeInTheDocument();
    expect(screen.getByText("Something else")).toBeInTheDocument();
  });

  it("disables continue button when nothing is selected", () => {
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    const btn = screen.getByRole("button", { name: /continue/i });
    expect(btn).toBeDisabled();
  });

  it("enables continue button after selecting an intent", async () => {
    const user = userEvent.setup();
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    await user.click(screen.getByText("Close deals"));
    const btn = screen.getByRole("button", { name: /continue/i });
    expect(btn).not.toBeDisabled();
  });

  it("calls onSubmit with selected key when continue is clicked", async () => {
    const user = userEvent.setup();
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    await user.click(screen.getByText("Find & reach people"));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSubmit).toHaveBeenCalledWith("reach");
  });

  it("pre-selects an intent from initialKey", () => {
    render(
      <StepIntent
        ownerName="Bob"
        initialKey="deals"
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    const radios = screen.getAllByRole("radio");
    const dealsRadio = radios.find((r) => r.getAttribute("aria-checked") === "true");
    expect(dealsRadio).toBeInTheDocument();
  });

  it("shows Setting up text when pending", () => {
    render(
      <StepIntent
        ownerName="Bob"
        initialKey="reach"
        onSubmit={onSubmit}
        pending={true}
      />,
    );
    expect(screen.getByText("Setting up…")).toBeInTheDocument();
  });

  it("disables button when pending", () => {
    render(
      <StepIntent
        ownerName="Bob"
        initialKey="reach"
        onSubmit={onSubmit}
        pending={true}
      />,
    );
    const btn = screen.getByRole("button", { name: /setting up/i });
    expect(btn).toBeDisabled();
  });

  it("shows the helper text about changing later", () => {
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    expect(screen.getByText("You can change this anytime.")).toBeInTheDocument();
  });

  it("does not call onSubmit when nothing is selected and button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
