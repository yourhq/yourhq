import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

import { StepWelcome } from "@/components/onboarding/wizard/step-welcome";

describe("StepWelcome", () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and subtitle", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    expect(screen.getByText("What's your name?")).toBeInTheDocument();
    expect(
      screen.getByText("We'll use this to set up your workspace."),
    ).toBeInTheDocument();
  });

  it("name input has correct placeholder", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    expect(screen.getByPlaceholderText("Your full name")).toBeInTheDocument();
  });

  it("continue button disabled when name empty", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    const btn = screen.getByRole("button", { name: /continue/i });
    expect(btn).toBeDisabled();
  });

  it("typing name enables continue button", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByPlaceholderText("Your full name"), "Alice");
    const btn = screen.getByRole("button", { name: /continue/i });
    expect(btn).not.toBeDisabled();
  });

  it("workspace auto-generates from first name", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByPlaceholderText("Your full name"), "Alice");
    expect(screen.getByText("Alice's HQ")).toBeInTheDocument();
  });

  it("clicking workspace name switches to edit input", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByPlaceholderText("Your full name"), "Alice");
    const wsButton = screen.getByText("Alice's HQ");
    await user.click(wsButton);
    const wsInput = screen.getByDisplayValue(
      "Alice's HQ",
    ) as HTMLInputElement;
    expect(wsInput.tagName).toBe("INPUT");
  });

  it("submit passes correct data shape", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(
      screen.getByPlaceholderText("Your full name"),
      "Alice Smith",
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      ownerName: "Alice Smith",
      preferredName: "Alice",
      workspaceName: "Alice's HQ",
      workspaceSlug: "alice-hq",
    });
  });

  it("pending state shows 'Setting up…' and disables button", () => {
    render(
      <StepWelcome
        onSubmit={onSubmit}
        pending={true}
        initialName="Alice"
      />,
    );
    const btn = screen.getByRole("button", { name: /setting up/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toBeDisabled();
  });

  it("enter key triggers submit", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    const input = screen.getByPlaceholderText("Your full name");
    await user.type(input, "Bob{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ownerName: "Bob" }),
    );
  });

  it("initialName pre-fills the input", () => {
    render(
      <StepWelcome
        onSubmit={onSubmit}
        pending={false}
        initialName="John Doe"
      />,
    );
    const input = screen.getByPlaceholderText(
      "Your full name",
    ) as HTMLInputElement;
    expect(input.value).toBe("John Doe");
  });

  it("custom workspace name overrides auto-generated", async () => {
    const user = userEvent.setup();
    render(
      <StepWelcome
        onSubmit={onSubmit}
        pending={false}
        initialName="Alice"
      />,
    );
    const wsButton = screen.getByText("Alice's HQ");
    await user.click(wsButton);
    const wsInput = screen.getByDisplayValue("Alice's HQ") as HTMLInputElement;
    await user.tripleClick(wsInput);
    await user.keyboard("My Workspace");
    fireEvent.blur(wsInput);
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceName: "My Workspace" }),
    );
  });

  it("escape key in workspace edit cancels editing", async () => {
    const user = userEvent.setup();
    render(
      <StepWelcome
        onSubmit={onSubmit}
        pending={false}
        initialName="Alice"
      />,
    );
    const wsButton = screen.getByText("Alice's HQ");
    await user.click(wsButton);
    const wsInput = screen.getByDisplayValue("Alice's HQ");
    await user.type(wsInput, "Custom Name");
    await user.keyboard("{Escape}");
    expect(screen.getByText("Alice's HQ")).toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("Custom Name"),
    ).not.toBeInTheDocument();
  });
});
