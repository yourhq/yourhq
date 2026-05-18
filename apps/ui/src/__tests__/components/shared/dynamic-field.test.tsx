import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DynamicField, DynamicFieldRow } from "@/components/shared/dynamic-field";
import type { FieldDefinition } from "@/lib/fields/types";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (r: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(r),
    }),
  }),
}));

function makeField(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: "field-1",
    created_at: new Date().toISOString(),
    entity_type: "contact",
    field_key: "test_field",
    field_type: "text",
    label: "Test Field",
    field_group: null,
    sort_order: 0,
    required: false,
    options: null,
    description: null,
    is_active: true,
    ...overrides,
  };
}

describe("DynamicField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders text input for text type", () => {
    const onChange = vi.fn();
    render(
      <DynamicField
        field={makeField({ field_type: "text" })}
        value=""
        onChange={onChange}
      />
    );
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
  });

  it("renders text input with existing value", () => {
    render(
      <DynamicField
        field={makeField({ field_type: "text" })}
        value="hello"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox")).toHaveValue("hello");
  });

  it("calls onChange on blur for text type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DynamicField
        field={makeField({ field_type: "text" })}
        value=""
        onChange={onChange}
      />
    );
    const input = screen.getByRole("textbox");
    await user.type(input, "new value");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("new value");
  });

  it("renders url input for url type", () => {
    render(
      <DynamicField
        field={makeField({ field_type: "url" })}
        value=""
        onChange={vi.fn()}
      />
    );
    const input = document.querySelector('input[type="url"]');
    expect(input).toBeInTheDocument();
  });

  it("renders number input for number type", () => {
    render(
      <DynamicField
        field={makeField({ field_type: "number" })}
        value={42}
        onChange={vi.fn()}
      />
    );
    const input = screen.getByRole("spinbutton");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue(42);
  });

  it("calls onChange with number on blur for number type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DynamicField
        field={makeField({ field_type: "number" })}
        value=""
        onChange={onChange}
      />
    );
    const input = screen.getByRole("spinbutton");
    await user.type(input, "99");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(99);
  });

  it("calls onChange with null for empty number on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DynamicField
        field={makeField({ field_type: "number" })}
        value={42}
        onChange={onChange}
      />
    );
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders textarea for textarea type", () => {
    render(
      <DynamicField
        field={makeField({ field_type: "textarea" })}
        value="long text"
        onChange={vi.fn()}
      />
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("long text");
  });

  it("calls onChange on blur for textarea type", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DynamicField
        field={makeField({ field_type: "textarea" })}
        value=""
        onChange={onChange}
      />
    );
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "some text");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith("some text");
  });

  it("renders switch for boolean type", () => {
    render(
      <DynamicField
        field={makeField({ field_type: "boolean" })}
        value={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("renders Yes label when boolean value is true", () => {
    render(
      <DynamicField
        field={makeField({ field_type: "boolean" })}
        value={true}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("calls onChange when boolean switch is toggled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DynamicField
        field={makeField({ field_type: "boolean" })}
        value={false}
        onChange={onChange}
      />
    );
    await user.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders select picker for select type", () => {
    render(
      <DynamicField
        field={makeField({
          field_type: "select",
          label: "Category",
          options: ["A", "B", "C"],
        })}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Select category...")).toBeInTheDocument();
  });

  it("renders selected value for select type", () => {
    render(
      <DynamicField
        field={makeField({
          field_type: "select",
          label: "Category",
          options: ["A", "B", "C"],
        })}
        value="B"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders date picker for date type", () => {
    render(
      <DynamicField
        field={makeField({
          field_type: "date",
          description: "Due date",
        })}
        value={null}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Due date")).toBeInTheDocument();
  });

  it("returns null for unknown field type", () => {
    const { container } = render(
      <DynamicField
        field={makeField({ field_type: "unknown" as never })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("uses description as placeholder for text input", () => {
    render(
      <DynamicField
        field={makeField({
          field_type: "text",
          description: "Enter a value",
        })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Enter a value")).toBeInTheDocument();
  });
});

describe("DynamicFieldRow", () => {
  it("renders label with field name", () => {
    render(
      <DynamicFieldRow
        field={makeField({ label: "Custom Field" })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Custom Field")).toBeInTheDocument();
  });

  it("renders required indicator when field is required", () => {
    render(
      <DynamicFieldRow
        field={makeField({ label: "Required Field", required: true })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("does not render required indicator when field is not required", () => {
    render(
      <DynamicFieldRow
        field={makeField({ label: "Optional Field", required: false })}
        value=""
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText("*")).not.toBeInTheDocument();
  });

  it("renders description text for non-text fields", () => {
    render(
      <DynamicFieldRow
        field={makeField({
          field_type: "boolean",
          description: "Toggle this setting",
        })}
        value={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Toggle this setting")).toBeInTheDocument();
  });
});
