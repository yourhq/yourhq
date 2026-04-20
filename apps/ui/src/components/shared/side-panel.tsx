"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Status indicator shown next to the title */
  status?: React.ReactNode;
  /** Optional sticky footer (e.g. Save / Cancel) */
  footer?: React.ReactNode;
  /** Width preset: "md" (480px), "lg" (560px, default), "xl" (720px) */
  width?: "md" | "lg" | "xl";
}

const WIDTH_CLASS: Record<NonNullable<SidePanelProps["width"]>, string> = {
  md: "sm:max-w-[480px]",
  lg: "sm:max-w-[560px]",
  xl: "sm:max-w-[720px]",
};

export function SidePanel({
  open,
  onClose,
  title,
  description,
  children,
  className,
  status,
  footer,
  width = "lg",
}: SidePanelProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col gap-0 border-l border-border/70 p-0",
          WIDTH_CLASS[width],
          className
        )}
      >
        {title ? (
          <SheetHeader className="shrink-0 gap-1 border-b border-border/60 px-5 py-4">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-heading">{title}</SheetTitle>
              {status}
            </div>
            {description && (
              <SheetDescription className="text-body text-muted-foreground">
                {description}
              </SheetDescription>
            )}
          </SheetHeader>
        ) : (
          <SheetHeader className="sr-only">
            <SheetTitle>Panel</SheetTitle>
          </SheetHeader>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border/60 bg-card/60 px-5 py-3">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
