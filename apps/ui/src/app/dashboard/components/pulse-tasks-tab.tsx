"use client";

import Link from "next/link";
import { ArrowRight, AlertCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { TaskStats, TaskCompletionDay } from "@/lib/types/dashboard";

const STATUS_CONFIG = [
  { key: "todo", label: "Todo", color: "var(--status-neutral)" },
  { key: "inProgress", label: "In progress", color: "var(--status-info)" },
  { key: "blocked", label: "Blocked", color: "var(--status-error)" },
  { key: "done", label: "Done", color: "var(--status-success)" },
] as const;

function CompletionChart({ data }: { data: TaskCompletionDay[] }) {
  if (data.length === 0) return null;

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.day + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "short",
    }),
  }));

  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] text-muted-foreground/60">
        Completed this week
      </p>
      <div className="h-[80px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              dy={4}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.3, radius: 4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const val = payload[0].value as number;
                return (
                  <div className="rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-[11px] shadow-lg">
                    <span className="font-medium tabular-nums">{val}</span>{" "}
                    <span className="text-muted-foreground">completed</span>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="completed"
              fill="var(--status-success)"
              opacity={0.7}
              radius={[3, 3, 0, 0]}
              maxBarSize={32}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PulseTasksTab({
  tasks,
  completionTrend,
}: {
  tasks: TaskStats;
  completionTrend: TaskCompletionDay[];
}) {
  const total = tasks.todo + tasks.inProgress + tasks.blocked + tasks.done;

  return (
    <div>
      {/* Status counts */}
      <div className="flex items-center gap-5">
        {STATUS_CONFIG.map(({ key, label, color }) => {
          const count = tasks[key as keyof TaskStats] as number;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-[12px] text-muted-foreground/70">
                {label}
              </span>
              <span className="text-[13px] font-medium tabular-nums">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
          {STATUS_CONFIG.map(({ key, color }) => {
            const count = tasks[key as keyof TaskStats] as number;
            const pct = (count / total) * 100;
            if (pct === 0) return null;
            return (
              <div
                key={key}
                className="h-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            );
          })}
        </div>
      )}

      {/* Overdue alert */}
      {tasks.overdue > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-[12px] text-[var(--status-error)]">
          <AlertCircle className="h-3 w-3" />
          <span className="font-medium">{tasks.overdue}</span> overdue
        </div>
      )}

      {/* Completion trend chart */}
      <CompletionChart data={completionTrend} />

      <div className="mt-3 flex justify-end">
        <Link
          href="/dashboard/tasks"
          className="group flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          View all tasks
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
