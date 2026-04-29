"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchAgentUsage,
  recomputeAgentBudget,
} from "@/app/dashboard/agents/usage-actions";
import { useAgentBudget } from "@/hooks/use-agent-budget";
import { BUDGET_STATUS_META } from "@/lib/usage/types";
import type { AgentUsageSummary, AgentUsageRow } from "@/lib/usage/types";
import { AgentBudgetEditDialog } from "./agent-budget-edit-dialog";

function fmtUsd(n: number): string {
  return n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const chartConfig: ChartConfig = {
  spend: { label: "Cost (USD)", color: "hsl(var(--chart-1))" },
  tokens: { label: "Tokens", color: "hsl(var(--chart-2))" },
};

export function AgentUsageTab({ agentId }: { agentId: string }) {
  const { budget, refresh: refreshBudget } = useAgentBudget(agentId);
  const [summary, setSummary] = useState<AgentUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [chartMode, setChartMode] = useState<"cost" | "tokens">("cost");
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAgentUsage(agentId);
      setSummary(data);
    } catch {
      // fail silently — empty state shown
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRecalc = useCallback(async () => {
    setRecalculating(true);
    try {
      await recomputeAgentBudget(agentId);
      await Promise.all([load(), refreshBudget()]);
      toast.success("Budget recalculated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recalculation failed");
    } finally {
      setRecalculating(false);
    }
  }, [agentId, load, refreshBudget]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const b = summary?.budget ?? budget;
  const hasLimit = b?.monthly_limit_usd != null;
  const spend = b?.current_period_spend_usd ?? 0;
  const tokens = b?.current_period_tokens ?? 0;
  const totalCalls =
    (b?.current_period_metered_calls ?? 0) +
    (b?.current_period_unmetered_calls ?? 0);
  const meta = b ? BUDGET_STATUS_META[b.status] : null;
  const pct =
    hasLimit && b
      ? Math.min((spend / b.monthly_limit_usd!) * 100, 100)
      : null;

  const daily = summary?.daily ?? [];
  const byModel = summary?.by_model ?? [];
  const recentTurns = summary?.recent_turns ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-5">
      {/* ── Header strip ─────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <HeaderStat label="Spent" value={fmtUsd(spend)} />
          <HeaderStat label="Tokens" value={fmtTokens(tokens)} />
          <HeaderStat label="Calls" value={String(totalCalls)} />
          {hasLimit && pct != null && meta && (
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: meta.color }}
              />
              <span className="text-[11px] text-muted-foreground">
                {meta.label}
              </span>
              <span className="text-[11px] font-medium tabular-nums text-foreground">
                {pct.toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {hasLimit && b && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>
              Budget: {fmtUsd(b.monthly_limit_usd!)}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: meta?.color,
                }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => setEditOpen(true)}
          >
            <Settings2 className="mr-1.5 h-3 w-3" />
            {hasLimit ? "Edit budget" : "Set budget"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={handleRecalc}
            disabled={recalculating}
          >
            <RefreshCw
              className={cn(
                "mr-1.5 h-3 w-3",
                recalculating && "animate-spin",
              )}
            />
            Recalculate
          </Button>
        </div>
      </div>

      {/* ── Daily chart ──────────────────────────────────── */}
      {daily.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Daily usage
            </h3>
            <div className="flex gap-1">
              <ChartToggle
                label="Cost"
                active={chartMode === "cost"}
                onClick={() => setChartMode("cost")}
              />
              <ChartToggle
                label="Tokens"
                active={chartMode === "tokens"}
                onClick={() => setChartMode("tokens")}
              />
            </div>
          </div>
          <ChartContainer config={chartConfig} className="aspect-[3/1] w-full">
            <AreaChart
              data={daily.map((d) => ({
                day: d.day.slice(5),
                spend: d.spend_usd ?? 0,
                tokens: d.tokens,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" fontSize={10} />
              <YAxis
                fontSize={10}
                tickFormatter={(v: number) =>
                  chartMode === "cost" ? `$${v.toFixed(2)}` : fmtTokens(v)
                }
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey={chartMode === "cost" ? "spend" : "tokens"}
                fill={
                  chartMode === "cost"
                    ? "var(--color-spend)"
                    : "var(--color-tokens)"
                }
                fillOpacity={0.15}
                stroke={
                  chartMode === "cost"
                    ? "var(--color-spend)"
                    : "var(--color-tokens)"
                }
                strokeWidth={1.5}
              />
            </AreaChart>
          </ChartContainer>
        </section>
      )}

      {/* ── Per-model breakdown ───────────────────────────── */}
      {byModel.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Per-model breakdown
          </h3>
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Calls</th>
                  <th className="px-3 py-2 text-right font-medium">Tokens</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((m) => (
                  <tr
                    key={m.model}
                    className="border-b border-border/30 last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-foreground">
                      {m.model}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {m.calls}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {fmtTokens(m.tokens)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {m.spend_usd != null ? fmtUsd(m.spend_usd) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Recent calls ─────────────────────────────────── */}
      {recentTurns.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent calls
          </h3>
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Time</th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Tokens (in/out)
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {recentTurns.slice(0, 50).map((r) => (
                  <RecentRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Empty state */}
      {daily.length === 0 &&
        byModel.length === 0 &&
        recentTurns.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">
            No usage data yet. Usage appears here once the agent makes LLM
            calls.
          </p>
        )}

      <AgentBudgetEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        agentId={agentId}
        current={b ?? null}
        onSaved={() => {
          refreshBudget();
          load();
        }}
      />
    </div>
  );
}

// ── Small components ────────────────────────────────────────────

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function ChartToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 text-[10px] transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function RecentRow({ row }: { row: AgentUsageRow }) {
  const time = (() => {
    try {
      return new Date(row.occurred_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return row.occurred_at;
    }
  })();

  return (
    <tr className="border-b border-border/30 last:border-0">
      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
        {time}
      </td>
      <td className="px-3 py-1.5 font-mono text-foreground">{row.model}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
        {fmtTokens(row.input_tokens)} / {fmtTokens(row.output_tokens)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
        {row.cost_total_usd != null ? fmtUsd(row.cost_total_usd) : "—"}
      </td>
    </tr>
  );
}
