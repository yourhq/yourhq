"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  variant?: "default" | "filtered";
  onClearFilters?: () => void;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "default",
  onClearFilters,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-3 py-12" : "gap-4 py-20",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border/70 bg-muted/40",
          compact ? "h-10 w-10" : "h-12 w-12"
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground",
            compact ? "h-4 w-4" : "h-5 w-5"
          )}
        />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-heading">{title}</p>
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {variant === "filtered" && onClearFilters ? (
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear filters
          </Button>
        ) : action ? (
          <Button variant="default" size="sm" onClick={action.onClick}>
            {action.icon ? (
              <action.icon className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Plus className="mr-1.5 h-3.5 w-3.5" />
            )}
            {action.label}
          </Button>
        ) : null}
        {secondaryAction && (
          <Button
            variant="ghost"
            size="sm"
            onClick={secondaryAction.onClick}
            className="text-muted-foreground"
          >
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
