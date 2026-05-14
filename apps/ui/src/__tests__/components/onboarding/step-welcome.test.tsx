import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

vi.mock("@/components/shared/hq-logo", () => ({
  HqLogo: () => <div data-testid="hq-logo" />,
}));

vi.mock("@/components/onboarding/wizard/staggered-entrance", () => ({
  StaggeredEntrance: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { StepWelcome } from "@/components/onboarding/wizard/step-welcome";

describe("StepWelcome", () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the heading", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    expect(screen.getByText("Welcome to HQ")).toBeInTheDocument();
  });

  it("renders default subtitle when none provided", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    expect(
      screen.getByText("Set up your workspace in a few steps."),
    ).toBeInTheDocument();
  });

  it("renders custom subtitle", () => {
    render(
      <StepWelcome
        onSubmit={onSubmit}
        pending={false}
        subtitle="Custom subtitle text"
      />,
    );
    expect(screen.getByText("Custom subtitle text")).toBeInTheDocument();
  });

  it("renders the name input", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    expect(screen.getByLabelText("What should we call you?")).toBeInTheDocument();
  });

  it("pre-fills name from initialName", () => {
    render(
      <StepWelcome
        onSubmit={onSubmit}
        pending={false}
        initialName="John Doe"
      />,
    );
    const input = screen.getByLabelText(
      "What should we call you?",
    ) as HTMLInputElement;
    expect(input.value).toBe("John Doe");
  });

  it("shows workspace name after typing a name", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByPlaceholderText("Your name"), "Alice");
    expect(screen.getByDisplayValue("Alice's HQ")).toBeInTheDocument();
  });

  it("shows edit button for workspace name", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByPlaceholderText("Your name"), "Bob");
    expect(
      screen.getByRole("button", { name: "Edit workspace name" }),
    ).toBeInTheDocument();
  });

  it("disables continue button when name is empty", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    const btn = screen.getByRole("button", { name: /continue/i });
    expect(btn).toBeDisabled();
  });

  it("enables continue button when name is entered", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByPlaceholderText("Your name"), "Eve");
    const btn = screen.getByRole("button", { name: /continue/i });
    expect(btn).not.toBeDisabled();
  });

  it("calls onSubmit with correct data when continue is clicked", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByPlaceholderText("Your name"), "Alice Smith");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      ownerName: "Alice Smith",
      preferredName: "Alice",
      workspaceName: "Alice's HQ",
      workspaceSlug: "alice-hq",
    });
  });

  it("calls onSubmit on Enter key press in name field", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    const input = screen.getByPlaceholderText("Your name");
    await user.type(input, "Bob{Enter}");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ownerName: "Bob" }),
    );
  });

  it("shows Saving text when pending", async () => {
    const user = userEvent.setup();
    render(<StepWelcome onSubmit={onSubmit} pending={true} initialName="X" />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });

  it("disables button when pending", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={true} initialName="X" />);
    const btn = screen.getByRole("button", { name: /saving/i });
    expect(btn).toBeDisabled();
  });

  it("renders the HQ logo", () => {
    render(<StepWelcome onSubmit={onSubmit} pending={false} />);
    expect(screen.getByTestId("hq-logo")).toBeInTheDocument();
  });

  it("allows editing the workspace name", async () => {
    const user = userEvent.setup();
    render(
      <StepWelcome
        onSubmit={onSubmit}
        pending={false}
        initialName="Alice"
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Edit workspace name" }),
    );
    const wsInput = screen.getByDisplayValue("Alice's HQ") as HTMLInputElement;
    expect(wsInput).not.toHaveAttribute("readonly");
  });
});
