"use client";

import type { AuditLogEntry } from "@/lib/audit/types";
import { ActivityItem } from "./activity-item";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";

interface ActivityFeedProps {
  entries: AuditLogEntry[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function ActivityFeed({ entries, loading, hasMore, onLoadMore }: ActivityFeedProps) {
  if (loading && entries.length === 0) {
    return <LoadingSkeleton variant="feed" count={6} />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Actions by you and agents will appear here."
      />
    );
  }

  return (
    <div>
      <div>
        {entries.map((entry) => (
          <ActivityItem key={entry.id} entry={entry} />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center mt-3">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onLoadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
