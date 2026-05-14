import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollectionCell } from "@/components/collections/collection-cell";
import type { CollectionField } from "@/lib/collections/types";

function buildField(overrides: Partial<CollectionField> = {}): CollectionField {
  return {
    id: "f-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    collection_id: "col-1",
    field_key: "name",
    field_type: "text",
    label: "Name",
    description: null,
    sort_order: 0,
    required: false,
    options: null,
    default_value: null,
    is_title_field: false,
    is_active: true,
    ...overrides,
  };
}

describe("CollectionCell", () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  describe("text field", () => {
    it("renders text value", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "text" })}
          value="Hello World"
          onChange={onChange}
        />
      );
      expect(screen.getByText("Hello World")).toBeInTheDocument();
    });

    it("shows dash for null value", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "text" })}
          value={null}
          onChange={onChange}
        />
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("enters edit mode on click and commits on Enter", async () => {
      const user = userEvent.setup();
      render(
        <CollectionCell
          field={buildField({ field_type: "text" })}
          value="Old"
          onChange={onChange}
        />
      );
      await user.click(screen.getByText("Old"));
      const input = screen.getByRole("textbox");
      expect(input).toHaveValue("Old");
      await user.clear(input);
      await user.type(input, "New{Enter}");
      expect(onChange).toHaveBeenCalledWith("New");
    });

    it("does not enter edit mode when readOnly", async () => {
      const user = userEvent.setup();
      render(
        <CollectionCell
          field={buildField({ field_type: "text" })}
          value="Locked"
          onChange={onChange}
          readOnly
        />
      );
      await user.click(screen.getByText("Locked"));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("discards changes on Escape", async () => {
      const user = userEvent.setup();
      render(
        <CollectionCell
          field={buildField({ field_type: "text" })}
          value="Original"
          onChange={onChange}
        />
      );
      await user.click(screen.getByText("Original"));
      const input = screen.getByRole("textbox");
      await user.clear(input);
      await user.type(input, "Changed");
      await user.keyboard("{Escape}");
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("number field", () => {
    it("renders numeric value", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "number" })}
          value={42}
          onChange={onChange}
        />
      );
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("shows dash for null value", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "number" })}
          value={null}
          onChange={onChange}
        />
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders zero value", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "number" })}
          value={0}
          onChange={onChange}
        />
      );
      expect(screen.getByText("0")).toBeInTheDocument();
    });
  });

  describe("date field", () => {
    it("renders formatted date in readOnly mode", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "date" })}
          value="2024-06-15"
          onChange={onChange}
          readOnly
        />
      );
      const expected = new Date("2024-06-15").toLocaleDateString();
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it("shows dash for null date in readOnly mode", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "date" })}
          value={null}
          onChange={onChange}
          readOnly
        />
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders date input in edit mode", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "date" })}
          value="2024-06-15"
          onChange={onChange}
        />
      );
      const input = document.querySelector('input[type="date"]');
      expect(input).toBeInTheDocument();
    });

    it("renders datetime input for datetime field", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "datetime" })}
          value="2024-06-15T10:30"
          onChange={onChange}
        />
      );
      const input = document.querySelector('input[type="datetime-local"]');
      expect(input).toBeInTheDocument();
    });
  });

  describe("boolean field", () => {
    it("renders checked checkbox for true value", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "boolean" })}
          value={true}
          onChange={onChange}
        />
      );
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toHaveAttribute("data-state", "checked");
    });

    it("renders unchecked checkbox for false value", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "boolean" })}
          value={false}
          onChange={onChange}
        />
      );
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toHaveAttribute("data-state", "unchecked");
    });

    it("disables checkbox in readOnly mode", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "boolean" })}
          value={true}
          onChange={onChange}
          readOnly
        />
      );
      expect(screen.getByRole("checkbox")).toBeDisabled();
    });

    it("calls onChange when checkbox is toggled", async () => {
      const user = userEvent.setup();
      render(
        <CollectionCell
          field={buildField({ field_type: "boolean" })}
          value={false}
          onChange={onChange}
        />
      );
      await user.click(screen.getByRole("checkbox"));
      expect(onChange).toHaveBeenCalledWith(true);
    });
  });

  describe("select field", () => {
    const selectField = buildField({
      field_type: "select",
      options: {
        choices: [
          { value: "active", label: "Active", color: "#22c55e" },
          { value: "inactive", label: "Inactive", color: "#ef4444" },
        ],
      },
    });

    it("renders selected option label in readOnly mode", () => {
      render(
        <CollectionCell
          field={selectField}
          value="active"
          onChange={onChange}
          readOnly
        />
      );
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("shows dash when no option matches in readOnly mode", () => {
      render(
        <CollectionCell
          field={selectField}
          value={null}
          onChange={onChange}
          readOnly
        />
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("renders select trigger in edit mode", () => {
      render(
        <CollectionCell
          field={selectField}
          value="active"
          onChange={onChange}
        />
      );
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });
  });

  describe("multi_select field", () => {
    const multiField = buildField({
      field_type: "multi_select",
      options: {
        choices: [
          { value: "red", label: "Red", color: "#ef4444" },
          { value: "blue", label: "Blue", color: "#3b82f6" },
          { value: "green", label: "Green", color: "#22c55e" },
        ],
      },
    });

    it("renders selected option badges", () => {
      render(
        <CollectionCell
          field={multiField}
          value={["red", "blue"]}
          onChange={onChange}
        />
      );
      expect(screen.getByText("Red")).toBeInTheDocument();
      expect(screen.getByText("Blue")).toBeInTheDocument();
    });

    it("shows dash for empty array", () => {
      render(
        <CollectionCell
          field={multiField}
          value={[]}
          onChange={onChange}
        />
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("removes a tag when clicked", async () => {
      const user = userEvent.setup();
      render(
        <CollectionCell
          field={multiField}
          value={["red", "blue"]}
          onChange={onChange}
        />
      );
      await user.click(screen.getByText("Red"));
      expect(onChange).toHaveBeenCalledWith(["blue"]);
    });

    it("does not show add trigger in readOnly mode", () => {
      render(
        <CollectionCell
          field={multiField}
          value={["red"]}
          onChange={onChange}
          readOnly
        />
      );
      expect(screen.getByText("Red")).toBeInTheDocument();
      expect(screen.queryByText("+")).not.toBeInTheDocument();
    });
  });

  describe("url field", () => {
    it("renders url value with external link", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "url" })}
          value="https://example.com"
          onChange={onChange}
          readOnly
        />
      );
      expect(screen.getByText("https://example.com")).toBeInTheDocument();
    });

    it("shows dash for null url", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "url" })}
          value={null}
          onChange={onChange}
          readOnly
        />
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  describe("email field", () => {
    it("renders email value as text cell", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "email" })}
          value="test@example.com"
          onChange={onChange}
        />
      );
      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });
  });

  describe("unknown field type", () => {
    it("renders dash for unsupported types", () => {
      render(
        <CollectionCell
          field={buildField({ field_type: "unknown_type" as never })}
          value="anything"
          onChange={onChange}
        />
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });
});
