"use client";

import { useState } from "react";
import { useInboxItems } from "@/hooks/use-inbox-items";
import type { InboxItem, InboxItemStatus } from "@/lib/inbox/types";
import { INBOX_STATUS_COLORS, INBOX_STATUS_BG } from "@/lib/inbox/types";
import { StatusDot } from "@/components/ui/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_TABS: { value: InboxItemStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "dead_letter", label: "Dead Letter" },
];

function InboxItemRow({ item }: { item: InboxItem }) {
  const [expanded, setExpanded] = useState(false);
  const isDeadLetter = item.status === "dead_letter";

  return (
    <div
      className={cn(
        "border-b border-border/50 last:border-0",
        isDeadLetter && "bg-status-error/5"
      )}
    >
      <button
        className="flex items-center gap-2.5 w-full px-2 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <StatusDot color={INBOX_STATUS_COLORS[item.status]} size="sm" />
        <span className={cn("text-[10px] px-1.5 py-px rounded shrink-0", INBOX_STATUS_BG[item.status])}>
          {item.event_type.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-muted-foreground truncate flex-1">
          {item.summary ?? "No summary"}
        </span>
        {item.attempt_count > 0 && (
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {item.attempt_count}x
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1">
          <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2.5 overflow-x-auto max-h-48 whitespace-pre-wrap break-all">
            {JSON.stringify(item.context, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

interface InboxSectionProps {
  agentId: string;
}

export function InboxSection({ agentId }: InboxSectionProps) {
  const { items, loading, hasMore, loadMore, statusFilter, setStatusFilter, counts } =
    useInboxItems({ agentId });

  const pendingCount = counts.pending;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Inbox className="mr-1.5 inline h-3 w-3" />
          Inbox
        </h2>
        {pendingCount > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-status-info/15 text-status-info border border-status-info/20">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-0.5 mb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            className={cn(
              "px-2 py-1 text-[11px] rounded-sm transition-colors",
              statusFilter === tab.value
                ? "bg-accent text-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <LoadingSkeleton variant="list" count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No inbox items"
          description={statusFilter === "all" ? "No items have been queued for this agent yet." : `No ${statusFilter.replace("_", " ")} items.`}
        />
      ) : (
        <div className="rounded-md border border-border/50">
          {items.map((item) => (
            <InboxItemRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
