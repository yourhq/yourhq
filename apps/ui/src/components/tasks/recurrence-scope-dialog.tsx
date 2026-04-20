"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type EditScope = "instance" | "series";

interface RecurrenceScopeDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (scope: EditScope) => void;
  title?: string;
}

export function RecurrenceScopeDialog({
  open,
  onCancel,
  onConfirm,
  title = "Apply changes to",
}: RecurrenceScopeDialogProps) {
  const [scope, setScope] = useState<EditScope>("series");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Choose whether to apply edits to just this occurrence or to all future occurrences.
        </DialogDescription>

        <div className="flex flex-col gap-1.5 mt-2">
          {[
            {
              value: "series" as const,
              label: "This and all future occurrences",
              hint: "Updates the recurring schedule",
            },
            {
              value: "instance" as const,
              label: "Just this occurrence",
              hint: "One-off change; series stays the same",
            },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setScope(opt.value)}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                scope === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:bg-accent"
              )}
            >
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
            </button>
          ))}
        </div>

        <DialogFooter className="mt-3 gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => onConfirm(scope)}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
