"use client";

import { cn } from "@/lib/utils";

interface FilterBarProps {
  search?: React.ReactNode;
  filters: React.ReactNode;
  actions?: React.ReactNode;
  count?: number;
  totalCount?: number;
  countLabel?: string;
  className?: string;
}

export function FilterBar({
  search,
  filters,
  actions,
  count,
  totalCount,
  countLabel,
  className,
}: FilterBarProps) {
  const isFiltered = totalCount !== undefined && count !== undefined && count !== totalCount;

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-border/50 px-3 py-1.5",
        className
      )}
    >
      {count !== undefined && (
        <span className="mr-1 text-xs text-muted-foreground tabular-nums">
          {isFiltered ? (
            <>
              <span className="text-foreground">{count}</span>
              <span className="mx-0.5">/</span>
              {totalCount} {countLabel ?? "items"}
            </>
          ) : (
            <>
              {count} {countLabel ?? "items"}
            </>
          )}
        </span>
      )}
      {search}
      {filters}
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions}
        </div>
      )}
    </div>
  );
}
