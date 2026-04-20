"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface LoadingSkeletonProps {
  variant: "table" | "cards" | "list" | "feed" | "detail";
  count?: number;
}

export function LoadingSkeleton({ variant, count }: LoadingSkeletonProps) {
  switch (variant) {
    case "table":
      return <TableSkeleton rows={count ?? 8} />;
    case "cards":
      return <CardsSkeleton count={count ?? 8} />;
    case "list":
      return <ListSkeleton rows={count ?? 8} />;
    case "feed":
      return <FeedSkeleton rows={count ?? 6} />;
    case "detail":
      return <DetailSkeleton />;
  }
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-border/50 px-3 py-2">
        {[120, 80, 100, 60, 80].map((w, i) => (
          <Skeleton key={i} className="h-2.5" style={{ width: w }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border/30 px-3 py-2 last:border-0"
        >
          <Skeleton className="h-2.5 w-[140px]" />
          <Skeleton className="h-2.5 w-[80px]" />
          <Skeleton className="h-2.5 w-[60px]" />
          <Skeleton className="h-2.5 w-[80px]" />
          <Skeleton className="h-2.5 w-[50px]" />
        </div>
      ))}
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-md border border-border/50 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-2.5 w-3/4" />
              <Skeleton className="h-2 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border/30 px-3 py-2"
        >
          <Skeleton className="h-3.5 w-3.5 rounded" />
          <Skeleton className="h-2.5 flex-1 max-w-[280px]" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

function FeedSkeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2.5 border-b border-border/30 px-3 py-2.5">
          <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-2.5 w-3/4" />
            <Skeleton className="h-2 w-1/2" />
          </div>
          <Skeleton className="h-2 w-12" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-2.5 w-2/3" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-5/6" />
        <Skeleton className="h-2.5 w-4/6" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-2.5 w-28" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    </div>
  );
}
