"use client";

import { useInboxItems } from "@/hooks/use-inbox-items";
import type { InboxItem } from "@/lib/inbox/types";
import { INBOX_STATUS_COLORS } from "@/lib/inbox/types";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { format } from "date-fns";

function HistoryItem({ item }: { item: InboxItem }) {
  const eventLabel = item.event_type.replace(/_/g, " ");
  const agentName = item.agent?.name ?? "unknown agent";

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <StatusDot color={INBOX_STATUS_COLORS[item.status]} size="sm" className="mt-1" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">{eventLabel}</span>
          {" → queued for "}
          <span className="text-foreground">{agentName}</span>
          {" → "}
          <span className="text-foreground">{item.status.replace("_", " ")}</span>
        </p>
        <span className="text-[10px] text-muted-foreground/60">
          {format(new Date(item.created_at), "MMM d, h:mm a")}
        </span>
      </div>
    </div>
  );
}

interface ContactInboxHistoryProps {
  contactId: string;
}

export function ContactInboxHistory({ contactId }: ContactInboxHistoryProps) {
  const { items, loading, hasMore, loadMore } = useInboxItems({ contactId });

  if (loading && items.length === 0) {
    return (
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Inbox History
        </h3>
        <LoadingSkeleton variant="list" count={2} />
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Inbox History
      </h3>
      <div className="space-y-0">
        {items.map((item) => (
          <HistoryItem key={item.id} item={item} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-1">
          <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Show more"}
          </Button>
        </div>
      )}
    </div>
  );
}
