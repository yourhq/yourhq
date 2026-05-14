import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { StepAgent, type AgentRecommendation } from "@/components/onboarding/wizard/step-agent";

const recommendation: AgentRecommendation = {
  templateBranch: "outreach-agent",
  name: "Scout",
  emoji: "🦊",
  description: "Finds and reaches potential contacts.",
  role: "Outreach Specialist",
};

describe("StepAgent", () => {
  const onCreateAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onCreateAgent.mockResolvedValue({ agentId: "a-1" });
  });

  it("renders the heading", () => {
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    expect(screen.getByText("Meet your agent")).toBeInTheDocument();
  });

  it("renders the recommendation role and description", () => {
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    expect(screen.getByText("Outreach Specialist")).toBeInTheDocument();
    expect(
      screen.getByText("Finds and reaches potential contacts."),
    ).toBeInTheDocument();
  });

  it("pre-fills agent name from recommendation", () => {
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    const input = screen.getByDisplayValue("Scout") as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it("renders the emoji avatar", () => {
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    expect(screen.getByText("🦊")).toBeInTheDocument();
  });

  it("renders create button with agent name", () => {
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: /create scout/i }),
    ).toBeInTheDocument();
  });

  it("calls onCreateAgent when create button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /create scout/i }));
    expect(onCreateAgent).toHaveBeenCalledWith({
      name: "Scout",
      emoji: "🦊",
      templateBranch: "outreach-agent",
    });
  });

  it("allows changing the agent name", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    const input = screen.getByDisplayValue("Scout");
    await user.clear(input);
    await user.type(input, "Ranger");
    expect(
      screen.getByRole("button", { name: /create ranger/i }),
    ).toBeInTheDocument();
  });

  it("uses recommendation name when input is cleared", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    const input = screen.getByDisplayValue("Scout");
    await user.clear(input);
    expect(
      screen.getByRole("button", { name: /create scout/i }),
    ).toBeInTheDocument();
  });

  it("shows emoji picker when avatar is clicked", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Change avatar" }));
    expect(
      screen.getByRole("radiogroup", { name: /choose an avatar/i }),
    ).toBeInTheDocument();
  });

  it("shows provisioning state after creation", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="provisioning"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /create scout/i }));
    await waitFor(() => {
      expect(screen.getByText(/Provisioning/)).toBeInTheDocument();
    });
  });

  it("shows ready state after provisioning completes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /create scout/i }));
    await waitFor(() => {
      expect(onCreateAgent).toHaveBeenCalled();
    });
    rerender(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="ready"
        pending={false}
      />,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows error state with custom error message", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /create scout/i }));
    await waitFor(() => {
      expect(onCreateAgent).toHaveBeenCalled();
    });
    rerender(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="error"
        provisionError="Gateway timeout"
        pending={false}
      />,
    );
    expect(screen.getByText("Gateway timeout")).toBeInTheDocument();
  });

  it("hides create button after agent is created", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /create scout/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /create scout/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("disables create button when pending", () => {
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={true}
      />,
    );
    const btn = screen.getByRole("button", { name: /create scout/i });
    expect(btn).toBeDisabled();
  });

  it("renders the description text about recommendation", () => {
    render(
      <StepAgent
        recommendation={recommendation}
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    expect(
      screen.getByText(/we recommend starting with Scout/),
    ).toBeInTheDocument();
  });
});
