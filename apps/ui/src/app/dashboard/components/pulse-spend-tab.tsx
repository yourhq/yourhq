"use client";

import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SpendSummary } from "@/lib/types/dashboard";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function StatusPill({
  label,
  variant,
}: {
  label: string;
  variant: "warning" | "error" | "neutral";
}) {
  const colors = {
    warning: "bg-[var(--status-warning)]/10 text-[var(--status-warning)]",
    error: "bg-[var(--status-error)]/10 text-[var(--status-error)]",
    neutral: "bg-muted/60 text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[variant]}`}
    >
      {label}
    </span>
  );
}

function SpendChart({ data }: { data: { day: string; spend_usd: number }[] }) {
  if (data.length < 2) return null;

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.day + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
    }),
  }));

  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] text-muted-foreground/60">
        Daily spend (7d)
      </p>
      <div className="h-[80px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--chart-3)"
                  stopOpacity={0.25}
                />
                <stop
                  offset="100%"
                  stopColor="var(--chart-3)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              dy={4}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const val = payload[0].value as number;
                return (
                  <div className="rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-[11px] shadow-lg">
                    <span className="font-medium tabular-nums">
                      ${val.toFixed(2)}
                    </span>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="spend_usd"
              stroke="var(--chart-3)"
              strokeWidth={1.5}
              fill="url(#spendGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PulseSpendTab({ spend }: { spend: SpendSummary }) {
  return (
    <div>
      {/* Headline */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <div>
          <span className="text-xl font-semibold tabular-nums">
            ${spend.total_spend_usd.toFixed(2)}
          </span>
          <span className="ml-1.5 text-[11px] text-muted-foreground/70">
            this month
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground/70">
          {fmt(spend.total_tokens)} tokens
        </span>
        <span className="text-[12px] text-muted-foreground/70">
          {spend.agent_count} agent{spend.agent_count !== 1 ? "s" : ""}
        </span>

        <div className="flex gap-1.5">
          {spend.warned_count > 0 && (
            <StatusPill
              label={`${spend.warned_count} warned`}
              variant="warning"
            />
          )}
          {spend.exceeded_count > 0 && (
            <StatusPill
              label={`${spend.exceeded_count} exceeded`}
              variant="error"
            />
          )}
          {spend.unmetered_count > 0 && (
            <StatusPill
              label={`${spend.unmetered_count} unmetered`}
              variant="neutral"
            />
          )}
        </div>
      </div>

      {/* Spend area chart */}
      <SpendChart data={spend.daily_spend_7d} />

      {/* Top spenders */}
      {spend.top_spenders.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border/30 pt-3">
          <p className="text-[11px] text-muted-foreground/60">Top spenders</p>
          {spend.top_spenders.map((s) => {
            const maxSpend = spend.top_spenders[0].spend_usd || 1;
            const pct = (s.spend_usd / maxSpend) * 100;
            return (
              <div key={s.agent_id} className="flex items-center gap-2.5">
                <span className="w-20 truncate text-[12px] text-muted-foreground/70">
                  {s.agent_name}
                </span>
                <div className="flex-1 h-1 rounded-full bg-muted/30">
                  <div
                    className="h-full rounded-full bg-[var(--chart-3)]/50 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground/70">
                  ${s.spend_usd.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
