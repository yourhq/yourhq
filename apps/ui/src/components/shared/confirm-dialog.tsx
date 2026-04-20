"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmTone = "destructive" | "warning" | "default";

export interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: LucideIcon | null;
  loading?: boolean;
}

const TONE_STYLES: Record<
  ConfirmTone,
  {
    iconWrap: string;
    iconColor: string;
    buttonVariant: "destructive" | "default";
    defaultIcon: LucideIcon;
  }
> = {
  destructive: {
    iconWrap: "bg-destructive/10",
    iconColor: "text-destructive",
    buttonVariant: "destructive",
    defaultIcon: AlertTriangle,
  },
  warning: {
    iconWrap: "bg-amber-500/10",
    iconColor: "text-amber-400",
    buttonVariant: "default",
    defaultIcon: AlertTriangle,
  },
  default: {
    iconWrap: "bg-muted",
    iconColor: "text-foreground",
    buttonVariant: "default",
    defaultIcon: AlertTriangle,
  },
};

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "destructive",
  icon,
  loading = false,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);
  const isBusy = loading || busy;

  const styles = TONE_STYLES[tone];
  const Icon = icon === null ? null : (icon ?? styles.defaultIcon);
  const resolvedConfirmLabel =
    confirmLabel ?? (tone === "destructive" ? "Delete" : "Confirm");

  async function handleConfirm(e: React.MouseEvent) {
    e.preventDefault();
    if (isBusy) return;
    try {
      setBusy(true);
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isBusy) onCancel();
      }}
    >
      <AlertDialogContent
        size="sm"
        className="max-w-[420px] gap-0 p-0 overflow-hidden"
        onEscapeKeyDown={(e) => {
          if (isBusy) e.preventDefault();
        }}
      >
        <div className="px-5 pt-5 pb-4">
          <AlertDialogHeader className="!block !text-left !place-items-start">
            <div className="flex items-start gap-3">
              {Icon && (
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                    styles.iconWrap
                  )}
                >
                  <Icon className={cn("h-4 w-4", styles.iconColor)} />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <AlertDialogTitle className="text-[15px] font-semibold leading-tight">
                  {title}
                </AlertDialogTitle>
                {description && (
                  <AlertDialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                    {description}
                  </AlertDialogDescription>
                )}
              </div>
            </div>
          </AlertDialogHeader>
        </div>
        <AlertDialogFooter className="flex flex-row justify-end gap-2 border-t border-border/60 bg-muted/20 px-5 py-3">
          <AlertDialogCancel
            size="sm"
            onClick={onCancel}
            disabled={isBusy}
            className="h-8"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={styles.buttonVariant}
            size="sm"
            onClick={handleConfirm}
            disabled={isBusy}
            className="h-8 min-w-[72px]"
          >
            {isBusy ? <Spinner className="h-3.5 w-3.5" /> : resolvedConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
