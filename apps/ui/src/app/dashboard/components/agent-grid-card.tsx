"use client";

import Link from "next/link";
import type { AgentFleetEnriched } from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<
  string,
  { dot: string; ring?: string; label: string; labelColor: string }
> = {
  ready: {
    dot: "bg-[var(--status-success)]",
    label: "Ready",
    labelColor: "text-[var(--status-success)]",
  },
  error: {
    dot: "bg-[var(--status-error)]",
    ring: "ring-1 ring-[var(--status-error)]/15",
    label: "Error",
    labelColor: "text-[var(--status-error)]",
  },
  paused: {
    dot: "bg-[var(--status-warning)]",
    label: "Paused",
    labelColor: "text-[var(--status-warning)]",
  },
  provisioning: {
    dot: "bg-[var(--status-warning)]",
    label: "Starting",
    labelColor: "text-[var(--status-warning)]",
  },
  hibernating: {
    dot: "bg-muted-foreground/30",
    label: "Offline",
    labelColor: "text-muted-foreground/50",
  },
};

export function AgentGridCard({ agent }: { agent: AgentFleetEnriched }) {
  const styles = STATUS_STYLES[agent.status] ?? STATUS_STYLES.hibernating;
  const isActive = agent.currentWorkType === "active";
  const isPulsing = isActive || agent.status === "provisioning";

  const hasTodayStats =
    agent.todayTasksCompleted > 0 || agent.todaySpendUsd > 0;

  return (
    <Link
      href={`/dashboard/agents/${agent.slug}`}
      className={cn(
        "group relative flex flex-col rounded-xl border border-border/40 bg-card",
        "p-4 transition-all duration-200",
        "hover:border-border/70 hover:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.08)] hover:-translate-y-[1px]",
        "dark:hover:shadow-[0_2px_12px_-2px_rgba(0,0,0,0.3)]",
        styles.ring,
      )}
    >
      {/* Top row: avatar + name + status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/50 text-lg leading-none">
            {agent.emoji ?? agent.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">
              {agent.name}
            </p>
            {agent.role && (
              <p className="truncate text-[11px] text-muted-foreground/60">
                {agent.role}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="relative flex h-1.5 w-1.5">
            {isPulsing && (
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
                  styles.dot,
                )}
              />
            )}
            <span
              className={cn(
                "relative inline-flex h-1.5 w-1.5 rounded-full",
                styles.dot,
              )}
            />
          </span>
        </div>
      </div>

      {/* Work status */}
      <div className="mt-3 min-h-[36px]">
        {agent.currentWork ? (
          <p className="line-clamp-2 text-[12px] leading-[1.5] text-foreground/70">
            {agent.currentWork}
          </p>
        ) : (
          <p className={cn("text-[12px]", styles.labelColor, "opacity-60")}>
            {styles.label}
          </p>
        )}
      </div>

      {/* Footer */}
      {hasTodayStats && (
        <div className="mt-auto flex items-center gap-2.5 pt-3 border-t border-border/30">
          {agent.todayTasksCompleted > 0 && (
            <span className="text-[11px] text-muted-foreground/50">
              <span className="font-medium text-foreground/60 tabular-nums">
                {agent.todayTasksCompleted}
              </span>{" "}
              task{agent.todayTasksCompleted !== 1 ? "s" : ""}
            </span>
          )}
          {agent.todaySpendUsd > 0 && (
            <span className="text-[11px] tabular-nums text-muted-foreground/40">
              ${agent.todaySpendUsd.toFixed(2)}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
