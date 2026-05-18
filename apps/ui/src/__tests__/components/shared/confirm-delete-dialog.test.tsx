import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
    title,
    description,
    confirmLabel,
    tone,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    tone?: string;
  }) =>
    open ? (
      <div data-testid="confirm-dialog" data-tone={tone}>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        <button onClick={onConfirm}>{confirmLabel ?? "Confirm"}</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConfirmDeleteDialog", () => {
  it("does not render when open is false", () => {
    render(
      <ConfirmDeleteDialog
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete item?"
      />
    );
    expect(screen.queryByText("Delete item?")).not.toBeInTheDocument();
  });

  it("renders title when open", () => {
    render(
      <ConfirmDeleteDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete this contact?"
      />
    );
    expect(screen.getByText("Delete this contact?")).toBeInTheDocument();
  });

  it("renders default description when none provided", () => {
    render(
      <ConfirmDeleteDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete?"
      />
    );
    expect(
      screen.getByText(
        "This action cannot be undone. This will permanently delete this item."
      )
    ).toBeInTheDocument();
  });

  it("renders custom description when provided", () => {
    render(
      <ConfirmDeleteDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete?"
        description="This removes the agent permanently."
      />
    );
    expect(
      screen.getByText("This removes the agent permanently.")
    ).toBeInTheDocument();
  });

  it("passes destructive tone to ConfirmDialog", () => {
    render(
      <ConfirmDeleteDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete?"
      />
    );
    expect(screen.getByTestId("confirm-dialog")).toHaveAttribute(
      "data-tone",
      "destructive"
    );
  });

  it("renders Delete as confirm label", () => {
    render(
      <ConfirmDeleteDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="Delete?"
      />
    );
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onConfirm when Delete is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteDialog
        open={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        title="Delete?"
      />
    );
    await user.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmDeleteDialog
        open={true}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        title="Delete?"
      />
    );
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
