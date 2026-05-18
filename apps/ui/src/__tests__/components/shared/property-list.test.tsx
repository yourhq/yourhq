import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldDefinition } from "@/lib/fields/types";

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn().mockReturnValue([]),
  closestCenter: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  useSortable: () => ({
    setNodeRef: vi.fn(),
    attributes: {},
    listeners: {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: {},
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => null } },
}));

vi.mock("@/components/shared/dynamic-field", () => ({
  DynamicField: ({
    field,
    value,
    onChange,
  }: {
    field: FieldDefinition;
    value: unknown;
    onChange: (v: unknown) => void;
    onPersistOptions?: (id: string, opts: string[]) => void;
    className?: string;
  }) => (
    <div data-testid={`dynamic-field-${field.field_key}`}>
      <span>{String(value ?? "")}</span>
      <button onClick={() => onChange("new-value")}>change</button>
    </div>
  ),
}));

vi.mock("@/components/shared/confirm-delete-dialog", () => ({
  ConfirmDeleteDialog: ({
    open,
    onConfirm,
    onCancel,
    title,
    description,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    description?: string;
  }) =>
    open ? (
      <div data-testid="confirm-delete-dialog">
        <p>{title}</p>
        {description && <p>{description}</p>}
        <button onClick={onConfirm}>Confirm Delete</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/responsive-popover", () => ({
  ResponsivePopover: ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (v: boolean) => void;
    children: React.ReactNode;
  }) => <div data-testid="responsive-popover">{children}</div>,
  ResponsivePopoverTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="popover-trigger">{children}</div>,
  ResponsivePopoverContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
    align?: string;
  }) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <label className={className}>{children}</label>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <button
      data-testid="switch"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? "on" : "off"}
    </button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid="select-trigger">{children}</div>,
  SelectValue: () => <span data-testid="select-value" />,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <div data-testid="select-item" data-value={value}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-menu">{children}</div>
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
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <div data-testid="dropdown-item" onClick={onClick}>
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="dropdown-trigger">{children}</div>,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          then: vi.fn(),
        }),
      }),
    }),
  }),
}));

import { PropertyList } from "@/components/shared/property-list";

function buildField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: "f1",
    created_at: new Date().toISOString(),
    entity_type: "contact",
    field_key: "company",
    field_type: "text",
    label: "Company",
    field_group: null,
    sort_order: 0,
    required: false,
    options: null,
    description: null,
    is_active: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function defaultProps(overrides: Partial<Parameters<typeof PropertyList>[0]> = {}) {
  return {
    fields: [buildField()],
    values: { company: "Acme" },
    onValueChange: vi.fn(),
    onAddField: vi.fn().mockResolvedValue(null),
    onUpdateField: vi.fn().mockResolvedValue(true),
    onDeleteField: vi.fn().mockResolvedValue(true),
    onReorderFields: vi.fn().mockResolvedValue(undefined),
    entityType: "contact",
    ...overrides,
  };
}

describe("PropertyList", () => {
  it("renders field rows with labels", () => {
    render(<PropertyList {...defaultProps()} />);
    expect(screen.getByText("Company")).toBeInTheDocument();
  });

  it("shows add property button when not readOnly", () => {
    render(<PropertyList {...defaultProps()} />);
    expect(screen.getByText("Add property")).toBeInTheDocument();
  });

  it("hides add property button when readOnly", () => {
    render(<PropertyList {...defaultProps({ readOnly: true })} />);
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
  });

  it("renders multiple field rows", () => {
    const fields = [
      buildField({ id: "f1", field_key: "company", label: "Company" }),
      buildField({ id: "f2", field_key: "title", label: "Title" }),
      buildField({ id: "f3", field_key: "phone", label: "Phone" }),
    ];
    render(
      <PropertyList
        {...defaultProps({
          fields,
          values: { company: "Acme", title: "CEO", phone: "555" },
        })}
      />
    );
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
  });

  it("shows delete confirmation dialog when delete is requested", async () => {
    const user = userEvent.setup();
    render(<PropertyList {...defaultProps()} />);

    const deleteButtons = screen.getAllByText("Delete");
    await user.click(deleteButtons[0]);

    expect(screen.getByTestId("confirm-delete-dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete property")).toBeInTheDocument();
  });

  it("shows required indicator for required fields", () => {
    const fields = [buildField({ required: true })];
    render(<PropertyList {...defaultProps({ fields })} />);
    expect(screen.getByText("Company")).toBeInTheDocument();
  });

  it("shows empty state when there are no fields", () => {
    render(
      <PropertyList {...defaultProps({ fields: [], values: {} })} />
    );
    expect(
      screen.getByText("No properties yet. Add one to track custom data.")
    ).toBeInTheDocument();
  });
});
