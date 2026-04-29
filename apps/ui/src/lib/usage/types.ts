export type BudgetStatus = "ok" | "warned" | "exceeded" | "unmetered";

export interface AgentBudget {
  agent_id: string;
  monthly_limit_usd: number | null;
  soft_threshold_pct: number;
  hard_cutoff: boolean;
  period_anchor_tz: string;
  current_period_start: string;
  current_period_spend_usd: number;
  current_period_tokens: number;
  current_period_metered_calls: number;
  current_period_unmetered_calls: number;
  status: BudgetStatus;
  warned_at: string | null;
  exceeded_at: string | null;
  last_usage_at: string | null;
  created_at: string;
  updated_at: string;
  meta: Record<string, unknown>;
}

export interface AgentUsageRow {
  id: string;
  agent_id: string | null;
  agent_slug_snapshot: string | null;
  gateway_id: string | null;
  session_id: string | null;
  run_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  total_tokens: number;
  cost_input_usd: number | null;
  cost_output_usd: number | null;
  cost_cache_read_usd: number | null;
  cost_cache_write_usd: number | null;
  cost_total_usd: number | null;
  occurred_at: string;
  meta: Record<string, unknown>;
}

export interface AgentUsageSummary {
  budget: AgentBudget;
  daily: { day: string; spend_usd: number | null; tokens: number }[];
  by_model: {
    model: string;
    calls: number;
    tokens: number;
    spend_usd: number | null;
  }[];
  recent_turns: AgentUsageRow[];
}

export interface FleetUsageSummary {
  total_spend_usd: number;
  total_tokens: number;
  agent_count: number;
  warned_count: number;
  exceeded_count: number;
  unmetered_count: number;
}

export const BUDGET_STATUS_META: Record<
  BudgetStatus,
  { label: string; color: string; description: string }
> = {
  ok: {
    label: "On track",
    color: "var(--status-success)",
    description: "Within budget",
  },
  warned: {
    label: "Warning",
    color: "var(--status-warning)",
    description: "Approaching budget limit",
  },
  exceeded: {
    label: "Exceeded",
    color: "var(--status-error)",
    description: "Budget limit reached",
  },
  unmetered: {
    label: "Unmetered",
    color: "var(--status-neutral)",
    description: "Provider doesn't report cost",
  },
};
