import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle } from "lucide-react";
import type {
  GatewaySummary,
  CommandQueueStats,
  InboxQueueStats,
} from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  online: "var(--status-success)",
  offline: "var(--status-error)",
  provisioning: "var(--status-warning)",
};

const STALE_MS = 2 * 60 * 1000;

function InlineStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  if (value === 0 && !warn) return null;
  return (
    <span className={cn("tabular-nums", warn && "text-[var(--status-error)]")}>
      {value} {label}
    </span>
  );
}

export function InfraCard({
  gateways,
  commandQueue,
  inboxQueue,
  now,
}: {
  gateways: GatewaySummary[];
  commandQueue: CommandQueueStats;
  inboxQueue: InboxQueueStats;
  now: number;
}) {
  const hasCommandStats =
    commandQueue.pending > 0 ||
    commandQueue.running > 0 ||
    commandQueue.failed_24h > 0;
  const hasInboxStats =
    inboxQueue.pending > 0 ||
    inboxQueue.failed > 0 ||
    inboxQueue.dead_letter > 0;

  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading">Infrastructure</h2>
        <Link
          href="/dashboard/settings/gateways"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Settings
        </Link>
      </div>

      {/* Gateways */}
      {gateways.length === 0 ? (
        <p className="py-4 text-body text-muted-foreground">
          No gateways registered.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {gateways.map((gw) => {
            const color =
              STATUS_COLOR[gw.status] ?? "var(--status-neutral)";
            const isStale =
              gw.status === "online" &&
              gw.last_seen_at &&
              now - new Date(gw.last_seen_at).getTime() > STALE_MS;

            return (
              <li
                key={gw.id}
                className="flex h-10 items-center gap-2.5 rounded-md px-2"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    gw.status === "online" && !isStale && "animate-pulse"
                  )}
                  style={{ backgroundColor: isStale ? "var(--status-warning)" : color }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                  {gw.label || gw.slug}
                </span>
                {isStale && (
                  <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--status-warning)]" />
                )}
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {gw.last_seen_at
                    ? formatDistanceToNow(new Date(gw.last_seen_at), {
                        addSuffix: true,
                      })
                    : "never"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pipeline stats */}
      {(hasCommandStats || hasInboxStats) && (
        <div className="mt-3 space-y-1 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
          {hasCommandStats && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground/60">Commands:</span>
              <div className="flex items-center gap-2">
                <InlineStat label="pending" value={commandQueue.pending} />
                <InlineStat label="running" value={commandQueue.running} />
                <InlineStat
                  label="failed (24h)"
                  value={commandQueue.failed_24h}
                  warn={commandQueue.failed_24h > 0}
                />
              </div>
            </div>
          )}
          {hasInboxStats && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground/60">Inbox:</span>
              <div className="flex items-center gap-2">
                <InlineStat label="pending" value={inboxQueue.pending} />
                <InlineStat
                  label="failed"
                  value={inboxQueue.failed}
                  warn={inboxQueue.failed > 0}
                />
                <InlineStat
                  label="dead letter"
                  value={inboxQueue.dead_letter}
                  warn={inboxQueue.dead_letter > 0}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
