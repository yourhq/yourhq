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
      description: "Cold outreach.",
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
      description: "Deal flow.",
      emoji: "💸",
      pipelineKey: "sales",
      fieldKey: "sales",
      streamNames: [],
      modules: { crm: true },
      collectionTemplateSlugs: [],
    },
  ],
}));

import { IntentCards } from "@/components/onboarding/wizard/intent-cards";

describe("IntentCards", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a radiogroup", () => {
    render(<IntentCards selected={null} onSelect={onSelect} />);
    expect(
      screen.getByRole("radiogroup", { name: /choose your use case/i }),
    ).toBeInTheDocument();
  });

  it("renders all preset cards", () => {
    render(<IntentCards selected={null} onSelect={onSelect} />);
    expect(screen.getByText("Find & reach people")).toBeInTheDocument();
    expect(screen.getByText("Close deals")).toBeInTheDocument();
  });

  it("renders preset descriptions", () => {
    render(<IntentCards selected={null} onSelect={onSelect} />);
    expect(screen.getByText("Cold outreach.")).toBeInTheDocument();
    expect(screen.getByText("Deal flow.")).toBeInTheDocument();
  });

  it("marks the selected card as checked", () => {
    render(<IntentCards selected="reach" onSelect={onSelect} />);
    const radios = screen.getAllByRole("radio");
    const reachRadio = radios.find(
      (r) => r.getAttribute("aria-checked") === "true",
    );
    expect(reachRadio).toBeInTheDocument();
    expect(reachRadio?.textContent).toContain("Find & reach people");
  });

  it("marks non-selected cards as unchecked", () => {
    render(<IntentCards selected="reach" onSelect={onSelect} />);
    const radios = screen.getAllByRole("radio");
    const unchecked = radios.filter(
      (r) => r.getAttribute("aria-checked") === "false",
    );
    expect(unchecked).toHaveLength(1);
  });

  it("calls onSelect with the correct key when a card is clicked", async () => {
    const user = userEvent.setup();
    render(<IntentCards selected={null} onSelect={onSelect} />);
    await user.click(screen.getByText("Close deals"));
    expect(onSelect).toHaveBeenCalledWith("deals");
  });

  it("calls onSelect when clicking already selected card", async () => {
    const user = userEvent.setup();
    render(<IntentCards selected="reach" onSelect={onSelect} />);
    await user.click(screen.getByText("Find & reach people"));
    expect(onSelect).toHaveBeenCalledWith("reach");
  });

  it("renders check icon on selected card", () => {
    const { container } = render(
      <IntentCards selected="reach" onSelect={onSelect} />,
    );
    const checkedCard = screen.getAllByRole("radio").find(
      (r) => r.getAttribute("aria-checked") === "true",
    );
    expect(checkedCard?.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render check icon on unselected cards", () => {
    render(<IntentCards selected="reach" onSelect={onSelect} />);
    const uncheckedCards = screen.getAllByRole("radio").filter(
      (r) => r.getAttribute("aria-checked") === "false",
    );
    for (const card of uncheckedCards) {
      const checkSvgs = card.querySelectorAll(".absolute svg");
      expect(checkSvgs.length).toBe(0);
    }
  });

  it("renders no cards as checked when selected is null", () => {
    render(<IntentCards selected={null} onSelect={onSelect} />);
    const checked = screen.getAllByRole("radio").filter(
      (r) => r.getAttribute("aria-checked") === "true",
    );
    expect(checked).toHaveLength(0);
  });
});
