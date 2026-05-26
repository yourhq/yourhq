"use client";

import { Loader2 } from "lucide-react";
import { isToday, isYesterday, isThisWeek } from "date-fns";
import type { AuditLogEntry } from "@/lib/audit/types";
import { ActivityItem } from "@/components/activity/activity-item";
import { Button } from "@/components/ui/button";
import { useActivityStream } from "../hooks/use-activity-stream";

type Bucket = "Today" | "Yesterday" | "This week" | "Earlier";

function bucketLabel(dateStr: string): Bucket {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return "This week";
  return "Earlier";
}

function groupByBucket(
  entries: AuditLogEntry[],
): { label: Bucket; entries: AuditLogEntry[] }[] {
  const order: Bucket[] = ["Today", "Yesterday", "This week", "Earlier"];
  const map = new Map<Bucket, AuditLogEntry[]>();

  for (const entry of entries) {
    const label = bucketLabel(entry.created_at);
    const list = map.get(label);
    if (list) list.push(entry);
    else map.set(label, [entry]);
  }

  return order
    .filter((b) => map.has(b))
    .map((label) => ({ label, entries: map.get(label)! }));
}

export function ActivityStream() {
  const { entries, loading, loadingMore, hasMore, loadMore } =
    useActivityStream();

  if (loading) {
    return (
      <section className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5">
        <h2 className="text-label text-muted-foreground/70 mb-4">Activity</h2>
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/30" />
        </div>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5">
        <h2 className="text-label text-muted-foreground/70 mb-4">Activity</h2>
        <p className="text-[12px] text-muted-foreground/40">
          No recent activity.
        </p>
      </section>
    );
  }

  const groups = groupByBucket(entries);

  return (
    <section className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="px-5 pt-4 pb-0">
        <h2 className="text-label text-muted-foreground/70">Activity</h2>
      </div>

      <div className="px-5 pb-4 pt-3 space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/35">
              {group.label}
            </h3>
            <div>
              {group.entries.map((entry) => (
                <ActivityItem key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="border-t border-border/20 px-5 py-2.5 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="text-[11px] text-muted-foreground/50 hover:text-foreground h-7"
          >
            {loadingMore && (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            )}
            Load more
          </Button>
        </div>
      )}
    </section>
  );
}
