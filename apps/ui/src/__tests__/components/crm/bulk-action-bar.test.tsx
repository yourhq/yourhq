import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkActionBar } from "@/components/crm/bulk-action-bar";

const stages = [
  { stage_key: "lead", label: "Lead" },
  { stage_key: "prospect", label: "Prospect" },
  { stage_key: "customer", label: "Customer" },
];

describe("BulkActionBar", () => {
  let onStatusChange: ReturnType<typeof vi.fn>;
  let onArchive: ReturnType<typeof vi.fn>;
  let onDelete: ReturnType<typeof vi.fn>;
  let onClear: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onStatusChange = vi.fn();
    onArchive = vi.fn();
    onDelete = vi.fn();
    onClear = vi.fn();
  });

  function renderBar(overrides: { count?: number; showArchived?: boolean } = {}) {
    return render(
      <BulkActionBar
        count={overrides.count ?? 3}
        stages={stages}
        showArchived={overrides.showArchived ?? false}
        onStatusChange={onStatusChange}
        onArchive={onArchive}
        onDelete={onDelete}
        onClear={onClear}
      />
    );
  }

  it("renders nothing when count is 0", () => {
    const { container } = renderBar({ count: 0 });
    expect(container.innerHTML).toBe("");
  });

  it("displays the selected count", () => {
    renderBar({ count: 5 });
    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });

  it("shows Change status and Archive buttons in non-archived mode", () => {
    renderBar();
    expect(screen.getByText("Change status")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("shows Delete button in archived mode", () => {
    renderBar({ showArchived: true });
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.queryByText("Change status")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });

  it("calls onArchive when Archive is clicked", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Archive"));
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("calls onDelete when Delete is clicked in archived mode", async () => {
    const user = userEvent.setup();
    renderBar({ showArchived: true });
    await user.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("calls onClear when clear button is clicked", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("opens status dropdown and calls onStatusChange", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("Change status"));
    await user.click(screen.getByText("Prospect"));
    expect(onStatusChange).toHaveBeenCalledWith("prospect");
  });
});
