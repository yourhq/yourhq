import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/onboarding/wizard/staggered-entrance", () => ({
  StaggeredEntrance: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

import { StepIntent } from "@/components/onboarding/wizard/step-intent";

const LABELS = [
  "Sales & outreach",
  "Creating content",
  "Managing clients",
  "Hiring people",
  "Doing research",
  "Staying organized",
];

const DETAILS = [
  "Prospects, deals, partnerships, networking",
  "Newsletters, posts, threads, publishing",
  "Accounts, deliverables, projects",
  "Sourcing, screening, interviews",
  "Markets, companies, trends, analysis",
  "Tasks, contacts, notes, a bit of everything",
];

describe("StepIntent", () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders heading and subtitle", () => {
    render(
      <StepIntent
        ownerName="Alice Smith"
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    expect(
      screen.getByText("What best describes your work?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We'll tailor your workspace and recommend the right agent.",
      ),
    ).toBeInTheDocument();
  });

  it("shows all 6 intent options with labels", () => {
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    for (const label of LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows detail text for each option", () => {
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    for (const detail of DETAILS) {
      expect(screen.getByText(detail)).toBeInTheDocument();
    }
  });

  it("clicking an option calls onSubmit with correct key after 350ms", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    await user.click(screen.getByText("Sales & outreach"));
    expect(onSubmit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    expect(onSubmit).toHaveBeenCalledWith("reach");
  });

  it("after selection, unselected options become dimmed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    await user.click(screen.getByText("Sales & outreach"));
    const unselected = screen.getByRole("radio", { name: /Creating content/i });
    expect(unselected.className).toContain("opacity-20");
  });

  it("selected option gets highlighted bg", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    await user.click(screen.getByText("Creating content"));
    const selected = screen.getByRole("radio", {
      name: /Creating content/i,
    });
    expect(selected.className).toContain("bg-foreground/[0.08]");
  });

  it("skip button calls onSubmit with 'explore'", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    const skipBtn = screen.getByRole("button", {
      name: /skip.*set things up myself/i,
    });
    await user.click(skipBtn);
    vi.advanceTimersByTime(350);
    expect(onSubmit).toHaveBeenCalledWith("explore");
  });

  it("skip button disabled when pending", () => {
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={true} />,
    );
    const skipBtn = screen.getByRole("button", {
      name: /skip.*set things up myself/i,
    });
    expect(skipBtn).toBeDisabled();
  });

  it("initialKey pre-selects an option", () => {
    render(
      <StepIntent
        ownerName="Bob"
        initialKey="hire"
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    const hireRadio = screen.getByRole("radio", { name: /Hiring people/i });
    expect(hireRadio).toHaveAttribute("aria-checked", "true");
  });

  it("radio buttons have correct roles", () => {
    render(
      <StepIntent ownerName="Bob" onSubmit={onSubmit} pending={false} />,
    );
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(6);
  });
});
