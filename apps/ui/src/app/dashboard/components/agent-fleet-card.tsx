import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ChevronRight } from "lucide-react";
import type { AgentFleetItem, CommandQueueStats } from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  online: "var(--status-success)",
  offline: "var(--status-neutral)",
  error: "var(--status-error)",
  paused: "var(--status-warning)",
};

export function AgentFleetCard({
  agents,
  commandQueue,
}: {
  agents: AgentFleetItem[];
  commandQueue: CommandQueueStats;
}) {
  const hasQueueActivity =
    commandQueue.pending > 0 || commandQueue.running > 0;

  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading">Agents</h2>
        <Link
          href="/dashboard/agents"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          View all{agents.length > 0 ? ` ${agents.length}` : ""}
        </Link>
      </div>

      {agents.length === 0 ? (
        <p className="py-4 text-body text-muted-foreground">
          No agents registered.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {agents.slice(0, 8).map((agent) => {
            const color = STATUS_COLOR[agent.status] ?? "var(--status-neutral)";
            return (
              <li key={agent.id}>
                <Link
                  href={`/dashboard/agents/${agent.slug}`}
                  className="group flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-muted/30"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      agent.status === "online" && "animate-pulse"
                    )}
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {agent.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {agent.last_seen_at
                      ? formatDistanceToNow(new Date(agent.last_seen_at), {
                          addSuffix: true,
                        })
                      : "never"}
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {hasQueueActivity && (
        <div className="mt-3 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
          Commands:{" "}
          {commandQueue.pending > 0 && (
            <span>{commandQueue.pending} pending</span>
          )}
          {commandQueue.pending > 0 && commandQueue.running > 0 && (
            <span> · </span>
          )}
          {commandQueue.running > 0 && (
            <span>{commandQueue.running} running</span>
          )}
        </div>
      )}
    </section>
  );
}
