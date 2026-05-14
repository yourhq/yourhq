import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} aria-label={rest["aria-label"]}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
  ),
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange,
    disabled,
    onSelect,
  }: {
    children: React.ReactNode;
    checked?: boolean;
    onCheckedChange?: () => void;
    disabled?: boolean;
    onSelect?: (e: Event) => void;
    className?: string;
  }) => (
    <button
      onClick={onCheckedChange}
      disabled={disabled}
      data-checked={checked}
      data-testid="checkbox-item"
    >
      {children}
    </button>
  ),
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
    align?: string;
    className?: string;
  }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => <button onClick={onClick}>{children}</button>,
  DropdownMenuLabel: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  TooltipTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
}));

import { ColumnToggle } from "@/components/shared/column-toggle";

const standardItems = [
  { id: "name", label: "Name", visible: true, locked: true, group: "standard" as const },
  { id: "status", label: "Status", visible: true, locked: false, group: "standard" as const },
  { id: "priority", label: "Priority", visible: false, locked: false, group: "standard" as const },
];

const customItems = [
  { id: "cf-1", label: "Custom Field", visible: true, locked: false, group: "custom" as const },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ColumnToggle", () => {
  it("renders Toggle columns label", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText("Toggle columns")).toBeInTheDocument();
  });

  it("renders Columns tooltip", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText("Columns")).toBeInTheDocument();
  });

  it("renders standard column items", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Priority")).toBeInTheDocument();
  });

  it("renders custom field section when custom items exist", () => {
    render(
      <ColumnToggle
        items={[...standardItems, ...customItems]}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText("Custom fields")).toBeInTheDocument();
    expect(screen.getByText("Custom Field")).toBeInTheDocument();
  });

  it("does not render custom section when no custom items", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.queryByText("Custom fields")).not.toBeInTheDocument();
  });

  it("calls onToggle when a checkbox item is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={onToggle}
        onReset={vi.fn()}
      />
    );
    await user.click(screen.getByText("Status"));
    expect(onToggle).toHaveBeenCalledWith("status");
  });

  it("disables locked items", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    const nameCheckbox = screen.getByText("Name").closest("button");
    expect(nameCheckbox).toBeDisabled();
  });

  it("renders Reset to default button", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByText("Reset to default")).toBeInTheDocument();
  });

  it("calls onReset when Reset to default is clicked", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={onReset}
      />
    );
    await user.click(screen.getByText("Reset to default"));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("marks visible items as checked", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    const checkboxItems = screen.getAllByTestId("checkbox-item");
    const statusItem = checkboxItems.find(
      (el) => el.textContent === "Status"
    );
    expect(statusItem).toHaveAttribute("data-checked", "true");
  });

  it("marks non-visible items as unchecked", () => {
    render(
      <ColumnToggle
        items={standardItems}
        onToggle={vi.fn()}
        onReset={vi.fn()}
      />
    );
    const checkboxItems = screen.getAllByTestId("checkbox-item");
    const priorityItem = checkboxItems.find(
      (el) => el.textContent === "Priority"
    );
    expect(priorityItem).toHaveAttribute("data-checked", "false");
  });
});
