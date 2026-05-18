import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/shared/modules-context", () => ({
  useModules: vi.fn().mockReturnValue({ crm: true }),
}));

vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="shortcuts-dialog">
        {children}
        <button onClick={() => onOpenChange(false)}>close</button>
      </div>
    ) : null,
  ResponsiveDialogContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div>{children}</div>,
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/components/ui/kbd", () => ({
  Kbd: ({ children }: { children: React.ReactNode }) => (
    <kbd>{children}</kbd>
  ),
}));

import { KeyboardShortcutsProvider } from "@/components/shared/keyboard-shortcuts";
import { useRouter } from "next/navigation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("KeyboardShortcutsProvider", () => {
  it("renders children", () => {
    render(
      <KeyboardShortcutsProvider>
        <div>App Content</div>
      </KeyboardShortcutsProvider>
    );
    expect(screen.getByText("App Content")).toBeInTheDocument();
  });

  it("opens help dialog on ? key press", async () => {
    const user = userEvent.setup();
    render(
      <KeyboardShortcutsProvider>
        <div>App</div>
      </KeyboardShortcutsProvider>
    );

    expect(screen.queryByTestId("shortcuts-dialog")).not.toBeInTheDocument();
    await user.keyboard("?");
    expect(screen.getByTestId("shortcuts-dialog")).toBeInTheDocument();
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
  });

  it("navigates with G then D shortcut", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
      forward: vi.fn(),
    });

    render(
      <KeyboardShortcutsProvider>
        <div>App</div>
      </KeyboardShortcutsProvider>
    );

    await user.keyboard("g");
    await user.keyboard("d");

    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("does not fire shortcuts when input is focused", async () => {
    const user = userEvent.setup();
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
      forward: vi.fn(),
    });

    render(
      <KeyboardShortcutsProvider>
        <input data-testid="text-input" />
      </KeyboardShortcutsProvider>
    );

    const input = screen.getByTestId("text-input");
    await user.click(input);
    await user.keyboard("g");
    await user.keyboard("d");

    expect(push).not.toHaveBeenCalled();
  });
});
