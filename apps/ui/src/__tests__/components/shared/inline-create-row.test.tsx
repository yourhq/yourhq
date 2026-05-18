import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlineCreateRow } from "@/components/shared/inline-create-row";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InlineCreateRow", () => {
  it("renders input with placeholder", () => {
    render(<InlineCreateRow placeholder="Add a task..." onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText("Add a task...")).toBeInTheDocument();
  });

  it("calls onSubmit with trimmed value on Enter", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InlineCreateRow placeholder="Add a task..." onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("Add a task...");
    await user.type(input, "New Task{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("New Task");
    expect(input).toHaveValue("");
  });

  it("clears input on Escape", async () => {
    const user = userEvent.setup();
    render(<InlineCreateRow placeholder="Add a task..." onSubmit={vi.fn()} />);

    const input = screen.getByPlaceholderText("Add a task...");
    await user.type(input, "Draft");
    expect(input).toHaveValue("Draft");

    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("does not call onSubmit when input is empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InlineCreateRow placeholder="Add a task..." onSubmit={onSubmit} />);

    const input = screen.getByPlaceholderText("Add a task...");
    await user.click(input);
    await user.keyboard("{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
