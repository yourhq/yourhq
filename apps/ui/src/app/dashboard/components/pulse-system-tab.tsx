"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type {
  GatewaySummary,
  CommandQueueStats,
  InboxQueueStats,
} from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

const GW_STATUS_DOT: Record<string, string> = {
  ready: "bg-[var(--status-success)]",
  error: "bg-[var(--status-error)]",
  offline: "bg-muted-foreground/40",
};

const STALE_THRESHOLD_MS = 2 * 60 * 1000;

export function PulseSystemTab({
  gateways,
  commandQueue,
  inboxQueue,
}: {
  gateways: GatewaySummary[];
  commandQueue: CommandQueueStats;
  inboxQueue: InboxQueueStats;
}) {
  const now = Date.now();

  return (
    <div>
      {/* Gateways */}
      <div className="space-y-2">
        {gateways.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/60">
            No gateways registered
          </p>
        ) : (
          gateways.map((gw) => {
            const isStale =
              gw.status === "ready" &&
              gw.last_seen_at &&
              now - new Date(gw.last_seen_at).getTime() > STALE_THRESHOLD_MS;
            const dot = isStale
              ? "bg-[var(--status-warning)]"
              : GW_STATUS_DOT[gw.status] ?? GW_STATUS_DOT.offline;

            return (
              <div
                key={gw.id}
                className="flex items-center gap-2.5 rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/30 transition-colors text-[12px]"
              >
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
                <span className="truncate text-foreground/80">
                  {gw.label || gw.slug}
                </span>
                {isStale && (
                  <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--status-warning)]" />
                )}
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/50">
                  {gw.last_seen_at
                    ? formatDistanceToNow(new Date(gw.last_seen_at), {
                        addSuffix: true,
                      })
                    : "never"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Queue stats */}
      {(commandQueue.pending > 0 ||
        commandQueue.running > 0 ||
        commandQueue.failed_24h > 0 ||
        inboxQueue.pending > 0 ||
        inboxQueue.failed > 0 ||
        inboxQueue.dead_letter > 0) && (
        <div className="mt-3 space-y-1.5 border-t border-border/30 pt-3 text-[11px] text-muted-foreground/70">
          {(commandQueue.pending > 0 ||
            commandQueue.running > 0 ||
            commandQueue.failed_24h > 0) && (
            <div className="flex gap-3">
              <span className="font-medium text-foreground/60">Commands</span>
              {commandQueue.pending > 0 && (
                <span>{commandQueue.pending} pending</span>
              )}
              {commandQueue.running > 0 && (
                <span>{commandQueue.running} running</span>
              )}
              {commandQueue.failed_24h > 0 && (
                <span className="text-[var(--status-error)]">
                  {commandQueue.failed_24h} failed
                </span>
              )}
            </div>
          )}
          {(inboxQueue.pending > 0 ||
            inboxQueue.failed > 0 ||
            inboxQueue.dead_letter > 0) && (
            <div className="flex gap-3">
              <span className="font-medium text-foreground/60">Inbox</span>
              {inboxQueue.pending > 0 && (
                <span>{inboxQueue.pending} pending</span>
              )}
              {inboxQueue.failed > 0 && (
                <span>{inboxQueue.failed} failed</span>
              )}
              {inboxQueue.dead_letter > 0 && (
                <span className="text-[var(--status-error)]">
                  {inboxQueue.dead_letter} dead letter
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Link
          href="/dashboard/settings/gateways"
          className="group flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          Gateway settings
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
