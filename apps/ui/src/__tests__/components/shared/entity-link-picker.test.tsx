import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    open: _open,
    onOpenChange: _onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    children: React.ReactNode;
  }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({
    children,
    asChild: _asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
    portal?: boolean;
  }) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock("@/components/ui/command", () => ({
  Command: ({
    children,
  }: {
    children: React.ReactNode;
    shouldFilter?: boolean;
  }) => <div data-testid="command">{children}</div>,
  CommandInput: ({
    placeholder,
    value,
    onValueChange,
  }: {
    placeholder?: string;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <input
      data-testid="command-input"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    />
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-list">{children}</div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="command-empty">{children}</div>
  ),
  CommandGroup: ({
    heading,
    children,
  }: {
    heading?: string;
    children: React.ReactNode;
  }) => (
    <div data-testid={`command-group-${heading}`} role="group" aria-label={heading}>
      {children}
    </div>
  ),
  CommandItem: ({
    children,
    onSelect,
    className: _className,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    className?: string;
    value?: string;
    disabled?: boolean;
  }) => (
    <div
      data-testid="command-item"
      onClick={disabled ? undefined : onSelect}
      aria-disabled={disabled}
    >
      {children}
    </div>
  ),
  CommandSeparator: () => <hr data-testid="command-separator" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

import { EntityLinkPicker } from "@/components/shared/entity-link-picker";
import type { EntityLink, EntityLinkSearchResult } from "@/lib/entity-links/types";

beforeEach(() => {
  vi.clearAllMocks();
});

function defaultProps(overrides: Partial<Parameters<typeof EntityLinkPicker>[0]> = {}) {
  return {
    links: [] as EntityLink[],
    onLinkEntity: vi.fn(),
    onLinkUrl: vi.fn(),
    onUploadFile: vi.fn(),
    onCreatePage: vi.fn(),
    searchTargets: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("EntityLinkPicker", () => {
  it("renders the trigger button with default label", () => {
    render(<EntityLinkPicker {...defaultProps()} />);
    expect(screen.getByText("Add link")).toBeInTheDocument();
  });

  it("renders custom trigger label", () => {
    render(<EntityLinkPicker {...defaultProps({ triggerLabel: "Attach" })} />);
    expect(screen.getByText("Attach")).toBeInTheDocument();
  });

  it("shows search input in popover content", () => {
    render(<EntityLinkPicker {...defaultProps()} />);
    expect(screen.getByTestId("command-input")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search items to link...")).toBeInTheDocument();
  });

  it("shows quick actions (Upload file, Create page, Add URL)", () => {
    render(<EntityLinkPicker {...defaultProps()} />);
    const actionsGroup = screen.getByTestId("command-group-Actions");
    expect(actionsGroup).toBeInTheDocument();
    expect(within(actionsGroup).getByText("Upload file...")).toBeInTheDocument();
    expect(within(actionsGroup).getByText("Create page...")).toBeInTheDocument();
    expect(within(actionsGroup).getByText("Add URL...")).toBeInTheDocument();
  });

  it("hides Upload file action when onUploadFile is not provided", () => {
    render(<EntityLinkPicker {...defaultProps({ onUploadFile: undefined })} />);
    expect(screen.queryByText("Upload file...")).not.toBeInTheDocument();
  });

  it("calls onLinkEntity when a search result is selected", async () => {
    const user = userEvent.setup();
    const searchTargets = vi.fn().mockResolvedValue([
      {
        id: "k1",
        name: "Design Doc",
        target_type: "knowledge_item",
      },
    ] as EntityLinkSearchResult[]);
    const onLinkEntity = vi.fn();

    render(
      <EntityLinkPicker
        {...defaultProps({ searchTargets, onLinkEntity })}
      />
    );

    const input = screen.getByTestId("command-input");
    await user.type(input, "Design");

    await vi.waitFor(() => {
      expect(screen.getByText("Design Doc")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Design Doc"));
    expect(onLinkEntity).toHaveBeenCalledWith("knowledge_item", "k1", "Design Doc");
  });
});
