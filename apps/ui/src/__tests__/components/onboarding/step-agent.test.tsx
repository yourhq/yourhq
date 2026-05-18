import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/lib/agents/emoji-grid", () => ({
  AGENT_EMOJIS: ["🤖", "🦊", "🎯", "⚡"],
  AGENT_EMOJI_LABELS: {
    "🤖": "Robot",
    "🦊": "Fox",
    "🎯": "Target",
    "⚡": "Lightning",
  } as Record<string, string>,
}));

vi.mock("@/components/onboarding/wizard/staggered-entrance", () => ({
  StaggeredEntrance: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => React.createElement("div", { className }, children),
}));

import { StepAgent } from "@/components/onboarding/wizard/step-agent";
import type { AgentTemplate } from "@/components/onboarding/wizard/onboarding-wizard";

function makeTemplate(overrides: Partial<AgentTemplate> & { key: string }): AgentTemplate {
  return {
    branch: `template/${overrides.key}`,
    name: overrides.key.charAt(0).toUpperCase() + overrides.key.slice(1),
    emoji: "🤖",
    role: `${overrides.key} role`,
    description: `Description for ${overrides.key}`,
    capabilities: [{ label: `${overrides.key} skill`, detail: "" }],
    ...overrides,
  };
}

const roster: AgentTemplate[] = [
  makeTemplate({ key: "scout", name: "Scout", emoji: "🦅", role: "Sales & Outreach", description: "Finds prospects.", capabilities: [{ label: "Prospect research", detail: "" }, { label: "Outreach drafting", detail: "" }] }),
  makeTemplate({ key: "writer", name: "Writer", emoji: "✍️", role: "Content Creator", description: "Writes content.", capabilities: [{ label: "Blog writing", detail: "" }] }),
  makeTemplate({ key: "ops", name: "Ops", emoji: "⚙️", role: "Operations", description: "Manages ops.", capabilities: [{ label: "Scheduling", detail: "" }] }),
  makeTemplate({ key: "researcher", name: "Researcher", emoji: "🔬", role: "Research Analyst", description: "Researches topics.", capabilities: [{ label: "Market analysis", detail: "" }] }),
  makeTemplate({ key: "recruiter", name: "Recruiter", emoji: "🤝", role: "Hiring", description: "Hires talent.", capabilities: [{ label: "Sourcing", detail: "" }] }),
  makeTemplate({ key: "extra1", name: "Extra One", emoji: "🌟", role: "Extra Role 1", description: "Extra agent 1.", capabilities: [{ label: "Extra skill 1", detail: "" }] }),
  makeTemplate({ key: "extra2", name: "Extra Two", emoji: "🔥", role: "Extra Role 2", description: "Extra agent 2.", capabilities: [{ label: "Extra skill 2", detail: "" }] }),
];

describe("StepAgent", () => {
  const onCreateAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    onCreateAgent.mockResolvedValue({ agentId: "a-1" });
  });

  it("renders heading and subtitle", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(screen.getByText("Choose your first employee")).toBeInTheDocument();
    expect(
      screen.getByText(/pick who to start with/i),
    ).toBeInTheDocument();
  });

  it("shows primary roster agents (first 5)", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(screen.getByText("Scout")).toBeInTheDocument();
    expect(screen.getByText("Writer")).toBeInTheDocument();
    expect(screen.getByText("Ops")).toBeInTheDocument();
    expect(screen.getByText("Researcher")).toBeInTheDocument();
    expect(screen.getByText("Recruiter")).toBeInTheDocument();
  });

  it("recommended agent shown with 'Suggested' badge", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(screen.getByText("Suggested")).toBeInTheDocument();
  });

  it("'X more employees' toggle shows remaining agents", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    const toggle = screen.getByRole("button", {
      name: /2 more employees/i,
    });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText("Extra One")).not.toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText("Extra One")).toBeInTheDocument();
    expect(screen.getByText("Extra Two")).toBeInTheDocument();
  });

  it("selecting a different agent updates detail card", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(screen.getByText("Finds prospects.")).toBeInTheDocument();
    const writerButtons = screen.getAllByText("Content Creator");
    const writerBtn = writerButtons[0].closest("button")!;
    await user.click(writerBtn);
    await waitFor(() => {
      expect(screen.getByText("Writes content.")).toBeInTheDocument();
    });
  });

  it("agent detail shows name, role, description", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(screen.getByDisplayValue("Scout")).toBeInTheDocument();
    expect(screen.getAllByText("Sales & Outreach").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Finds prospects.")).toBeInTheDocument();
  });

  it("agent capabilities displayed in detail card", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(screen.getByText("Prospect research")).toBeInTheDocument();
    expect(screen.getByText("Outreach drafting")).toBeInTheDocument();
  });

  it("name input allows customization", async () => {
    const user = userEvent.setup();
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
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

  it("create button shows agent name", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: /create scout/i }),
    ).toBeInTheDocument();
  });

  it("collectOnly mode shows 'Continue with {name}'", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onContinue={vi.fn()}
        collectOnly={true}
        pending={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: /continue with scout/i }),
    ).toBeInTheDocument();
  });

  it("after creation, shows provision status", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /create scout/i }));
    await waitFor(() => expect(onCreateAgent).toHaveBeenCalled());
    rerender(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        provisionStatus="provisioning"
        pending={false}
      />,
    );
    expect(screen.getByText(/setting up scout/i)).toBeInTheDocument();
  });

  it("provision error displays error message", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        provisionStatus="idle"
        pending={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /create scout/i }));
    await waitFor(() => expect(onCreateAgent).toHaveBeenCalled());
    rerender(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        provisionStatus="error"
        provisionError="Gateway timeout"
        pending={false}
      />,
    );
    expect(screen.getByText("Gateway timeout")).toBeInTheDocument();
  });

  it("platform capabilities section shows 'Every employee can' items", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(screen.getByText("Every employee can")).toBeInTheDocument();
    expect(screen.getByText("Browse the web autonomously")).toBeInTheDocument();
    expect(
      screen.getByText("Learn and remember new skills"),
    ).toBeInTheDocument();
    expect(screen.getByText("Access your knowledge base")).toBeInTheDocument();
    expect(
      screen.getByText("Work on tasks independently"),
    ).toBeInTheDocument();
  });

  it("emoji change button has 'Change avatar' label", () => {
    render(
      <StepAgent
        roster={roster}
        recommendedKey="scout"
        onCreateAgent={onCreateAgent}
        pending={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Change avatar" }),
    ).toBeInTheDocument();
  });
});
