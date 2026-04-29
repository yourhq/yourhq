"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  AgentBudget,
  AgentUsageRow,
  AgentUsageSummary,
  FleetUsageSummary,
} from "@/lib/usage/types";

export async function fetchAgentBudget(
  agentId: string,
): Promise<AgentBudget | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_budgets")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();
  return (data as AgentBudget | null) ?? null;
}

export async function setAgentBudget(input: {
  agentId: string;
  monthlyLimitUsd: number | null;
  softThresholdPct: number;
  hardCutoff: boolean;
}): Promise<AgentBudget> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("agent_budgets")
    .upsert(
      {
        agent_id: input.agentId,
        monthly_limit_usd: input.monthlyLimitUsd,
        soft_threshold_pct: input.softThresholdPct,
        hard_cutoff: input.hardCutoff,
      },
      { onConflict: "agent_id" },
    )
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to save budget");
  return data as AgentBudget;
}

export async function fetchAgentUsage(
  agentId: string,
): Promise<AgentUsageSummary> {
  const supabase = await createClient();

  const [budgetRes, dailyRes, modelRes, recentRes] = await Promise.all([
    supabase
      .from("agent_budgets")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle(),

    supabase.rpc("get_agent_daily_usage", { p_agent_id: agentId }),

    supabase
      .from("agent_usage")
      .select("model, cost_total_usd, total_tokens")
      .eq("agent_id", agentId)
      .order("occurred_at", { ascending: false }),

    supabase
      .from("agent_usage")
      .select("*")
      .eq("agent_id", agentId)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);

  const budget = (budgetRes.data as AgentBudget | null) ?? {
    agent_id: agentId,
    monthly_limit_usd: null,
    soft_threshold_pct: 80,
    hard_cutoff: true,
    period_anchor_tz: "UTC",
    current_period_start: new Date().toISOString().slice(0, 10),
    current_period_spend_usd: 0,
    current_period_tokens: 0,
    current_period_metered_calls: 0,
    current_period_unmetered_calls: 0,
    status: "ok" as const,
    warned_at: null,
    exceeded_at: null,
    last_usage_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    meta: {},
  };

  // Build daily aggregation client-side if RPC doesn't exist yet
  const daily = buildDailyFromRpc(dailyRes.data) ?? buildDailyFromRows(
    (recentRes.data ?? []) as AgentUsageRow[],
    budget.current_period_start,
  );

  const by_model = buildModelBreakdown(
    (modelRes.data ?? []) as Array<{
      model: string;
      cost_total_usd: number | null;
      total_tokens: number;
    }>,
  );

  return {
    budget,
    daily,
    by_model,
    recent_turns: (recentRes.data ?? []) as AgentUsageRow[],
  };
}

export async function recomputeAgentBudget(
  agentId: string,
): Promise<AgentBudget | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recompute_agent_budget", {
    p_agent_id: agentId,
  });
  if (error) throw new Error(error.message);
  return (data as AgentBudget | null) ?? null;
}

export async function fetchFleetUsage(): Promise<FleetUsageSummary> {
  const supabase = await createClient();
  const { data } = await supabase.from("agent_budgets").select("*");
  const rows = (data ?? []) as AgentBudget[];

  return {
    total_spend_usd: rows.reduce(
      (s, r) => s + (r.current_period_spend_usd ?? 0),
      0,
    ),
    total_tokens: rows.reduce((s, r) => s + (r.current_period_tokens ?? 0), 0),
    agent_count: rows.length,
    warned_count: rows.filter((r) => r.status === "warned").length,
    exceeded_count: rows.filter((r) => r.status === "exceeded").length,
    unmetered_count: rows.filter((r) => r.status === "unmetered").length,
  };
}

// ── helpers ──────────────────────────────────────────────────────

function buildDailyFromRpc(
  data: unknown,
): { day: string; spend_usd: number | null; tokens: number }[] | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.map((r: Record<string, unknown>) => ({
    day: String(r.day ?? ""),
    spend_usd: r.spend_usd != null ? Number(r.spend_usd) : null,
    tokens: Number(r.tokens ?? 0),
  }));
}

function buildDailyFromRows(
  rows: AgentUsageRow[],
  periodStart: string,
): { day: string; spend_usd: number | null; tokens: number }[] {
  const byDay = new Map<
    string,
    { spend: number | null; tokens: number }
  >();
  const start = new Date(periodStart);
  for (const row of rows) {
    if (new Date(row.occurred_at) < start) continue;
    const day = row.occurred_at.slice(0, 10);
    const prev = byDay.get(day) ?? { spend: null, tokens: 0 };
    byDay.set(day, {
      spend:
        row.cost_total_usd != null
          ? (prev.spend ?? 0) + row.cost_total_usd
          : prev.spend,
      tokens: prev.tokens + row.total_tokens,
    });
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, spend_usd: v.spend, tokens: v.tokens }));
}

function buildModelBreakdown(
  rows: Array<{
    model: string;
    cost_total_usd: number | null;
    total_tokens: number;
  }>,
): {
  model: string;
  calls: number;
  tokens: number;
  spend_usd: number | null;
}[] {
  const byModel = new Map<
    string,
    { calls: number; tokens: number; spend: number | null }
  >();
  for (const row of rows) {
    const prev = byModel.get(row.model) ?? {
      calls: 0,
      tokens: 0,
      spend: null,
    };
    byModel.set(row.model, {
      calls: prev.calls + 1,
      tokens: prev.tokens + row.total_tokens,
      spend:
        row.cost_total_usd != null
          ? (prev.spend ?? 0) + row.cost_total_usd
          : prev.spend,
    });
  }
  return Array.from(byModel.entries())
    .sort(([, a], [, b]) => (b.spend ?? 0) - (a.spend ?? 0))
    .map(([model, v]) => ({
      model,
      calls: v.calls,
      tokens: v.tokens,
      spend_usd: v.spend,
    }));
}
