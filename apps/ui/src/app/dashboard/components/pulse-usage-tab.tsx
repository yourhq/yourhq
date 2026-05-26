"use client";

import Link from "next/link";
import { ArrowRight, TrendingUp, Zap, AlertTriangle } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { UsageBudgetData, AgentBudgetDetail } from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function BudgetRing({
  spent,
  limit,
  status,
}: {
  spent: number;
  limit: number | null;
  status: string;
}) {
  if (limit === null || limit === 0) return null;
  const pct = Math.min((spent / limit) * 100, 100);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const strokeColor =
    status === "exceeded"
      ? "var(--status-error)"
      : status === "warned"
        ? "var(--status-warning)"
        : "var(--status-success)";

  return (
    <div className="relative flex h-[100px] w-[100px] items-center justify-center">
      <svg
        width="100"
        height="100"
        viewBox="0 0 100 100"
        className="-rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-muted/20"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="6"
          stroke={strokeColor}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[18px] font-semibold tabular-nums leading-none">
          {Math.round(pct)}%
        </span>
        <span className="mt-0.5 text-[9px] text-muted-foreground/50">
          of budget
        </span>
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  ok: {
    bg: "bg-[var(--status-success)]/8",
    text: "text-[var(--status-success)]",
    dot: "bg-[var(--status-success)]",
  },
  warned: {
    bg: "bg-[var(--status-warning)]/8",
    text: "text-[var(--status-warning)]",
    dot: "bg-[var(--status-warning)]",
  },
  exceeded: {
    bg: "bg-[var(--status-error)]/8",
    text: "text-[var(--status-error)]",
    dot: "bg-[var(--status-error)]",
  },
  unmetered: {
    bg: "bg-muted/40",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
};

function AgentBudgetRow({ agent }: { agent: AgentBudgetDetail }) {
  const colors = STATUS_COLORS[agent.status] ?? STATUS_COLORS.ok;
  const pct =
    agent.limitUsd && agent.limitUsd > 0
      ? Math.min((agent.spendUsd / agent.limitUsd) * 100, 100)
      : null;

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40 text-sm leading-none shrink-0">
        {agent.agentEmoji ?? agent.agentName.charAt(0)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] font-medium text-foreground/90">
            {agent.agentName}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[12px] font-medium tabular-nums text-foreground/80">
              ${agent.spendUsd.toFixed(2)}
            </span>
            {agent.limitUsd !== null && (
              <span className="text-[11px] text-muted-foreground/40 tabular-nums">
                / ${agent.limitUsd.toFixed(0)}
              </span>
            )}
          </div>
        </div>

        {pct !== null && (
          <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                agent.status === "exceeded"
                  ? "bg-[var(--status-error)]"
                  : agent.status === "warned"
                    ? "bg-[var(--status-warning)]"
                    : "bg-[var(--status-success)]/70",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        {pct === null && (
          <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
            <div className="h-full w-full rounded-full bg-muted-foreground/10" />
          </div>
        )}
      </div>

      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide",
          colors.bg,
          colors.text,
        )}
      >
        {agent.status === "ok"
          ? "healthy"
          : agent.status === "unmetered"
            ? "no limit"
            : agent.status}
      </span>
    </div>
  );
}

function DailySpendChart({
  data,
}: {
  data: { day: string; spend_usd: number }[];
}) {
  if (data.length < 2) return null;

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.day + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
    }),
  }));

  return (
    <div className="h-[90px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--chart-1)"
                stopOpacity={0.2}
              />
              <stop
                offset="100%"
                stopColor="var(--chart-1)"
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
            stroke="var(--chart-1)"
            strokeWidth={1.5}
            fill="url(#usageGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PulseUsageTab({ usage }: { usage: UsageBudgetData }) {
  const hasAlerts = usage.warnedCount > 0 || usage.exceededCount > 0;
  const overallStatus =
    usage.exceededCount > 0
      ? "exceeded"
      : usage.warnedCount > 0
        ? "warned"
        : "ok";

  return (
    <div className="space-y-4">
      {/* Top: ring + headline stats */}
      <div className="flex items-start gap-6">
        {usage.totalBudgetLimitUsd !== null && (
          <BudgetRing
            spent={usage.totalSpendUsd}
            limit={usage.totalBudgetLimitUsd}
            status={overallStatus}
          />
        )}

        <div className="flex-1 space-y-3 pt-1">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-semibold tabular-nums leading-none">
                ${usage.totalSpendUsd.toFixed(2)}
              </span>
              {usage.totalBudgetLimitUsd !== null && (
                <span className="text-[12px] text-muted-foreground/50">
                  / ${usage.totalBudgetLimitUsd.toFixed(0)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground/50">
              this billing period
            </p>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <Zap className="h-3 w-3" />
              <span className="tabular-nums font-medium text-foreground/60">
                {fmt(usage.totalTokens)}
              </span>{" "}
              tokens
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
              <TrendingUp className="h-3 w-3" />
              <span className="tabular-nums font-medium text-foreground/60">
                {usage.agentBudgets.length}
              </span>{" "}
              agent{usage.agentBudgets.length !== 1 ? "s" : ""}
            </div>
          </div>

          {hasAlerts && (
            <div className="flex gap-2">
              {usage.exceededCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-error)]/8 px-2 py-0.5 text-[10px] font-medium text-[var(--status-error)]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {usage.exceededCount} exceeded
                </span>
              )}
              {usage.warnedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--status-warning)]/8 px-2 py-0.5 text-[10px] font-medium text-[var(--status-warning)]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {usage.warnedCount} warned
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Daily spend chart */}
      {usage.dailySpend7d.length >= 2 && (
        <div>
          <p className="mb-2 text-[11px] text-muted-foreground/50">
            Daily spend (7d)
          </p>
          <DailySpendChart data={usage.dailySpend7d} />
        </div>
      )}

      {/* Per-agent budget breakdown */}
      {usage.agentBudgets.length > 0 && (
        <div className="border-t border-border/20 pt-3">
          <p className="mb-1.5 text-[11px] text-muted-foreground/50">
            Agent budgets
          </p>
          <div className="space-y-0.5">
            {usage.agentBudgets.map((agent) => (
              <AgentBudgetRow key={agent.agentId} agent={agent} />
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Link
          href="/dashboard/agents"
          className="group flex items-center gap-1 text-[11px] text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          Manage budgets
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
