import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArchiveToggle } from "@/components/shared/archive-toggle";

describe("ArchiveToggle", () => {
  it("renders Archived label", () => {
    render(<ArchiveToggle showArchived={false} onToggle={vi.fn()} />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("calls onToggle with true when currently not showing archived", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ArchiveToggle showArchived={false} onToggle={onToggle} />);
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("calls onToggle with false when currently showing archived", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ArchiveToggle showArchived={true} onToggle={onToggle} />);
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("shows count when showArchived is true and count is provided", () => {
    render(
      <ArchiveToggle showArchived={true} onToggle={vi.fn()} count={7} />
    );
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("does not show count when showArchived is false", () => {
    render(
      <ArchiveToggle showArchived={false} onToggle={vi.fn()} count={7} />
    );
    expect(screen.queryByText("7")).not.toBeInTheDocument();
  });

  it("does not show count when count is 0", () => {
    render(
      <ArchiveToggle showArchived={true} onToggle={vi.fn()} count={0} />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
  });

  it("does not show count when count is undefined", () => {
    render(<ArchiveToggle showArchived={true} onToggle={vi.fn()} />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });
});
