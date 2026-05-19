import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

import { StepAccount } from "@/components/onboarding/wizard/step-account";

describe("StepAccount", () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders heading and description", () => {
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    expect(screen.getByText("Create your login")).toBeInTheDocument();
    expect(
      screen.getByText(/Almost done/),
    ).toBeInTheDocument();
  });

  it("renders email and password fields", () => {
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("disables submit button when fields are empty", () => {
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    const btn = screen.getByRole("button", { name: /finish setup/i });
    expect(btn).toBeDisabled();
  });

  it("disables submit button when email is invalid", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByLabelText("Email"), "notanemail");
    await user.type(screen.getByLabelText("Password"), "password123");
    const btn = screen.getByRole("button", { name: /finish setup/i });
    expect(btn).toBeDisabled();
  });

  it("disables submit button when password is too short", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "12345");
    const btn = screen.getByRole("button", { name: /finish setup/i });
    expect(btn).toBeDisabled();
  });

  it("enables submit button with valid email and 6+ char password", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    const btn = screen.getByRole("button", { name: /finish setup/i });
    expect(btn).not.toBeDisabled();
  });

  it("calls onSubmit with email and password on button click", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: /finish setup/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "secret123",
    });
  });

  it("calls onSubmit when pressing Enter in email field", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "123456");
    await user.click(screen.getByLabelText("Email"));
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "123456",
    });
  });

  it("calls onSubmit when pressing Enter in password field", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByLabelText("Email"), "a@b.com");
    await user.type(screen.getByLabelText("Password"), "123456{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "123456",
    });
  });

  it("shows error message when error prop is set", () => {
    render(
      <StepAccount
        onSubmit={onSubmit}
        pending={false}
        error="Email already taken"
      />,
    );
    expect(screen.getByText("Email already taken")).toBeInTheDocument();
  });

  it("does not show error when error prop is null", () => {
    render(
      <StepAccount onSubmit={onSubmit} pending={false} error={null} />,
    );
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("shows Creating account text when pending", () => {
    render(<StepAccount onSubmit={onSubmit} pending={true} />);
    expect(screen.getByText("Creating account…")).toBeInTheDocument();
  });

  it("disables button when pending", () => {
    render(<StepAccount onSubmit={onSubmit} pending={true} />);
    const btn = screen.getByRole("button", { name: /creating account/i });
    expect(btn).toBeDisabled();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("shows placeholder text for email and password", () => {
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("At least 6 characters"),
    ).toBeInTheDocument();
  });

  it("does not call onSubmit when form is invalid and Enter is pressed", async () => {
    const user = userEvent.setup();
    render(<StepAccount onSubmit={onSubmit} pending={false} />);
    await user.type(screen.getByLabelText("Email"), "bad{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
