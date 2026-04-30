import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { SpendSummary } from "@/lib/types/dashboard";
import { StatusPill } from "@/components/ui/status-dot";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function SpendCard({ spend }: { spend: SpendSummary }) {
  const maxSpend =
    spend.top_spenders.length > 0
      ? Math.max(...spend.top_spenders.map((s) => s.spend_usd))
      : 0;

  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading">Spend</h2>
        <span className="text-[11px] text-muted-foreground">This month</span>
      </div>

      {/* Headline stats */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted-foreground">Total</span>
          <span className="text-[18px] font-semibold tabular-nums">
            ${spend.total_spend_usd.toFixed(2)}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted-foreground">Tokens</span>
          <span className="text-[14px] font-semibold tabular-nums">
            {fmt(spend.total_tokens)}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted-foreground">Agents</span>
          <span className="text-[14px] font-semibold tabular-nums">
            {spend.agent_count}
          </span>
        </div>

        {/* Budget status pills */}
        <div className="flex items-center gap-2">
          {spend.warned_count > 0 && (
            <StatusPill
              color="var(--status-warning)"
              label={`${spend.warned_count} warned`}
              size="sm"
            />
          )}
          {spend.exceeded_count > 0 && (
            <StatusPill
              color="var(--status-error)"
              label={`${spend.exceeded_count} exceeded`}
              size="sm"
            />
          )}
          {spend.unmetered_count > 0 && (
            <StatusPill
              color="var(--status-neutral)"
              label={`${spend.unmetered_count} unmetered`}
              size="sm"
            />
          )}
        </div>
      </div>

      {/* 7-day sparkline */}
      {spend.daily_spend_7d.length >= 2 && (
        <div className="mt-4 h-[60px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={spend.daily_spend_7d}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="spendCardFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--status-info)"
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--status-info)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="spend_usd"
                stroke="var(--status-info)"
                strokeWidth={1.5}
                fill="url(#spendCardFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top spenders */}
      {spend.top_spenders.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border/40 pt-4">
          <span className="text-[11px] text-muted-foreground">
            Top spenders
          </span>
          <div className="space-y-1.5">
            {spend.top_spenders.map((s) => (
              <div key={s.agent_id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                  {s.agent_name}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  ${s.spend_usd.toFixed(2)}
                </span>
                <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--status-info)]"
                    style={{
                      width: `${maxSpend > 0 ? (s.spend_usd / maxSpend) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
