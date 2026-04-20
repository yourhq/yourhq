"use client";

import { ConfirmDialog } from "./confirm-dialog";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title: string;
  description?: string;
}

export function ConfirmDeleteDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
}: ConfirmDeleteDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onConfirm={onConfirm}
      onCancel={onCancel}
      title={title}
      description={
        description ??
        "This action cannot be undone. This will permanently delete this item."
      }
      tone="destructive"
      confirmLabel="Delete"
    />
  );
}
