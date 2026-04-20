"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  tabs?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  bordered?: boolean;
}

export function PageHeader({
  title,
  description,
  icon,
  primaryAction,
  secondaryActions,
  tabs,
  meta,
  className,
  bordered = true,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-5 pt-5",
        tabs ? "pb-0" : "pb-4",
        bordered && "border-b border-border/60",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground">
              {icon}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <h1 className="text-display truncate">{title}</h1>
            {description && (
              <p className="text-body text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      </div>

      {meta && <div className="flex items-center gap-2">{meta}</div>}

      {tabs && <div className="-mx-1">{tabs}</div>}
    </div>
  );
}

interface PageSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: PageSectionProps) {
  return (
    <section className={cn("px-5 py-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            {title && <h2 className="text-heading">{title}</h2>}
            {description && (
              <p className="text-caption text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
