"use client";

import { useAgentBudget } from "@/hooks/use-agent-budget";
import { BUDGET_STATUS_META } from "@/lib/usage/types";
import { DetailSidebarSection } from "@/components/shared/detail-sidebar";

function fmtUsd(n: number): string {
  return n < 0.01 && n > 0
    ? `$${n.toFixed(4)}`
    : `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AgentUsageRail({ agentId }: { agentId: string }) {
  const { budget, loading } = useAgentBudget(agentId);

  if (loading || !budget) {
    return (
      <DetailSidebarSection title="Usage">
        <p className="text-[11px] text-muted-foreground/70">
          {loading ? "Loading…" : "No usage data yet."}
        </p>
      </DetailSidebarSection>
    );
  }

  const hasLimit = budget.monthly_limit_usd != null;
  const spend = budget.current_period_spend_usd;
  const tokens = budget.current_period_tokens;
  const meta = BUDGET_STATUS_META[budget.status];
  const pct = hasLimit
    ? Math.min((spend / budget.monthly_limit_usd!) * 100, 100)
    : 0;

  const periodLabel = (() => {
    try {
      const d = new Date(budget.current_period_start + "T00:00:00Z");
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch {
      return budget.current_period_start;
    }
  })();

  return (
    <DetailSidebarSection title="Usage">
      <div className="space-y-1.5">
        {/* Spend + tokens */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-foreground">
            {fmtUsd(spend)}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground/70">
            {fmtTokens(tokens)} tokens
          </span>
        </div>

        {/* Budget bar (only if limit set) */}
        {hasLimit && (
          <div className="space-y-1">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: meta.color,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">
                of {fmtUsd(budget.monthly_limit_usd!)}
              </span>
              <span
                className="inline-flex items-center gap-1"
                style={{ color: meta.color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: meta.color }}
                />
                {meta.label}
              </span>
            </div>
          </div>
        )}

        {!hasLimit && (
          <p className="text-[10px] text-muted-foreground/60">No limit set</p>
        )}

        {/* Period */}
        <p className="text-[10px] text-muted-foreground/50">{periodLabel}</p>
      </div>
    </DetailSidebarSection>
  );
}
