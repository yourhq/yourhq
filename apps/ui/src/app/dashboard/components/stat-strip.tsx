import Link from "next/link";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types/dashboard";
import { SpendSparkline } from "./spend-sparkline";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function Chip({
  label,
  value,
  href,
  warn,
  children,
}: {
  label: string;
  value: string;
  href: string;
  warn?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors hover:bg-muted/30"
    >
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-[14px] font-semibold tabular-nums",
          warn && "text-[var(--status-error)]"
        )}
      >
        {value}
      </span>
      {children}
    </Link>
  );
}

export function StatStrip({ stats }: { stats: DashboardStats }) {
  const hasAgentError = stats.agentCounts.error > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-border/40 pb-4">
      <Chip
        label="Agents"
        value={`${stats.agentCounts.online}/${stats.agentCounts.total}`}
        href="/dashboard/agents"
        warn={hasAgentError}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            hasAgentError
              ? "bg-[var(--status-error)]"
              : stats.agentCounts.online > 0
                ? "animate-pulse bg-[var(--status-success)]"
                : "bg-[var(--status-neutral)]"
          )}
        />
      </Chip>

      <Chip
        label="Gateways"
        value={`${stats.gatewayCounts.online}/${stats.gatewayCounts.total}`}
        href="/dashboard/settings/gateways"
        warn={
          stats.gatewayCounts.total > 0 &&
          stats.gatewayCounts.online < stats.gatewayCounts.total
        }
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            stats.gatewayCounts.online === stats.gatewayCounts.total &&
              stats.gatewayCounts.total > 0
              ? "animate-pulse bg-[var(--status-success)]"
              : stats.gatewayCounts.online < stats.gatewayCounts.total
                ? "bg-[var(--status-error)]"
                : "bg-[var(--status-neutral)]"
          )}
        />
      </Chip>

      <Chip
        label="Active"
        value={fmt(stats.activeTaskCount)}
        href="/dashboard/tasks"
      />

      <Chip
        label="Overdue"
        value={fmt(stats.overdueCount)}
        href="/dashboard/tasks"
        warn={stats.overdueCount > 0}
      />

      <Chip
        label="Follow-ups"
        value={fmt(stats.followUpCount)}
        href="/dashboard/crm"
        warn={stats.followUpCount > 0}
      />

      <Chip
        label="Spend"
        value={`$${stats.spend.total_spend_usd.toFixed(2)}`}
        href="/dashboard/agents"
      >
        <SpendSparkline data={stats.spend.daily_spend_7d} />
      </Chip>
    </div>
  );
}
