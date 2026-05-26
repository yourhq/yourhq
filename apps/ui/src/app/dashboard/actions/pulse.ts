"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/require-auth";
import type { PipelineStage } from "@/lib/fields/types";
import type {
  CrmStats,
  TaskStats,
  SpendSummary,
  PipelineStageCount,
  GatewaySummary,
  CommandQueueStats,
  InboxQueueStats,
  WorkspacePulseData,
  PulseTab,
  TaskCompletionDay,
  UsageBudgetData,
  AgentBudgetDetail,
} from "@/lib/types/dashboard";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error(`[pulse] ${fn.name || "query"} failed:`, err.message || e);
    return fallback;
  }
}

// ── Task Stats ─────────────────────────────────────────────────────

async function fetchTaskStats(): Promise<
  TaskStats & { completionTrend7d: TaskCompletionDay[] }
> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const statuses = [
    "todo",
    "in_progress",
    "blocked",
    "done",
    "cancelled",
  ] as const;

  const [counts, overdueRes, trendRes] = await Promise.all([
    Promise.all(
      statuses.map((s) =>
        supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("status", s)
          .is("archived_at", null),
      ),
    ),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .in("status", ["todo", "in_progress", "blocked"])
      .lt("due_date", today),
    supabase
      .from("tasks")
      .select("completed_at")
      .eq("status", "done")
      .gte("completed_at", sevenDaysAgo)
      .is("archived_at", null)
      .order("completed_at", { ascending: true })
      .limit(500),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  statuses.forEach((s, i) => {
    const c = counts[i].count ?? 0;
    byStatus[s] = c;
    total += c;
  });

  // Bucket completions by day
  const dayMap = new Map<string, number>();
  for (const row of (trendRes.data ?? []) as { completed_at: string }[]) {
    const day = row.completed_at.split("T")[0];
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }

  // Fill in missing days with zeros
  const completionTrend7d: TaskCompletionDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().split("T")[0];
    completionTrend7d.push({ day, completed: dayMap.get(day) ?? 0 });
  }

  return {
    total,
    todo: byStatus.todo ?? 0,
    inProgress: byStatus.in_progress ?? 0,
    blocked: byStatus.blocked ?? 0,
    done: byStatus.done ?? 0,
    overdue: overdueRes.count ?? 0,
    completionTrend7d,
  };
}

// ── CRM Stats ──────────────────────────────────────────────────────

async function fetchCrmStats(): Promise<CrmStats> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: stagesData } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("entity_type", "contact")
    .order("sort_order", { ascending: true });

  const stages = (stagesData ?? []) as PipelineStage[];

  const counts = await Promise.all(
    stages.map((s) =>
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("status", s.stage_key)
        .is("archived_at", null),
    ),
  );

  const pipeline: PipelineStageCount[] = stages.map((s, i) => ({
    stage_key: s.stage_key,
    label: s.label,
    color: s.color,
    is_terminal: s.is_terminal,
    count: counts[i].count ?? 0,
  }));

  const totalContacts = pipeline.reduce((sum, p) => sum + p.count, 0);

  const [contactsThisWeekRes, followupsRes, interactionsRes] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo)
        .is("archived_at", null),
      supabase
        .from("interactions")
        .select("*", { count: "exact", head: true })
        .not("next_action_date", "is", null)
        .lte("next_action_date", new Date().toISOString()),
      supabase
        .from("interactions")
        .select("*", { count: "exact", head: true })
        .gte("occurred_at", sevenDaysAgo),
    ]);

  return {
    pipeline,
    totalContacts,
    contactsAddedThisWeek: contactsThisWeekRes.count ?? 0,
    followupsDue: followupsRes.count ?? 0,
    interactionsThisWeek: interactionsRes.count ?? 0,
  };
}

// ── Spend Summary ──────────────────────────────────────────────────

async function fetchSpendSummary(): Promise<SpendSummary> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [budgetRes, usageRes] = await Promise.all([
    supabase
      .from("agent_budgets")
      .select(
        "agent_id, current_period_spend_usd, current_period_tokens, status",
      ),
    supabase
      .from("agent_usage")
      .select("cost_total_usd, occurred_at")
      .gte("occurred_at", sevenDaysAgo)
      .order("occurred_at", { ascending: true }),
  ]);

  type BudgetRow = {
    agent_id: string;
    current_period_spend_usd: number;
    current_period_tokens: number;
    status: string;
  };
  const budgets = (budgetRes.data ?? []) as BudgetRow[];

  const total_spend_usd = budgets.reduce(
    (s, r) => s + (r.current_period_spend_usd ?? 0),
    0,
  );
  const total_tokens = budgets.reduce(
    (s, r) => s + (r.current_period_tokens ?? 0),
    0,
  );

  type UsageRow = { cost_total_usd: number | null; occurred_at: string };
  const usageRows = (usageRes.data ?? []) as UsageRow[];
  const dailyMap = new Map<string, number>();
  for (const row of usageRows) {
    const day = row.occurred_at.split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + (row.cost_total_usd ?? 0));
  }
  const daily_spend_7d = Array.from(dailyMap.entries())
    .map(([day, spend_usd]) => ({ day, spend_usd }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const topBudgets = [...budgets]
    .sort(
      (a, b) =>
        (b.current_period_spend_usd ?? 0) - (a.current_period_spend_usd ?? 0),
    )
    .slice(0, 3)
    .filter((b) => (b.current_period_spend_usd ?? 0) > 0);

  let top_spenders: SpendSummary["top_spenders"] = [];
  if (topBudgets.length > 0) {
    const { data: agentNames } = await supabase
      .from("agents")
      .select("id, name")
      .in(
        "id",
        topBudgets.map((b) => b.agent_id),
      );
    const nameMap = new Map(
      (agentNames ?? []).map((a: { id: string; name: string }) => [
        a.id,
        a.name,
      ]),
    );
    top_spenders = topBudgets.map((b) => ({
      agent_id: b.agent_id,
      agent_name: nameMap.get(b.agent_id) ?? "Unknown",
      spend_usd: b.current_period_spend_usd ?? 0,
    }));
  }

  return {
    total_spend_usd,
    total_tokens,
    agent_count: budgets.length,
    warned_count: budgets.filter((r) => r.status === "warned").length,
    exceeded_count: budgets.filter((r) => r.status === "exceeded").length,
    unmetered_count: budgets.filter((r) => r.status === "unmetered").length,
    daily_spend_7d,
    top_spenders,
  };
}

// ── Infrastructure ─────────────────────────────────────────────────

async function fetchGatewayStats(): Promise<GatewaySummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gateways")
    .select("id, slug, label, status, last_seen_at");
  return (data ?? []) as GatewaySummary[];
}

async function fetchCommandQueueStats(): Promise<CommandQueueStats> {
  const supabase = await createClient();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [pending, running, failed] = await Promise.all([
    supabase
      .from("agent_commands")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "leased"]),
    supabase
      .from("agent_commands")
      .select("*", { count: "exact", head: true })
      .eq("status", "running"),
    supabase
      .from("agent_commands")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", dayAgo),
  ]);

  return {
    pending: pending.count ?? 0,
    running: running.count ?? 0,
    failed_24h: failed.count ?? 0,
  };
}

async function fetchInboxQueueStats(): Promise<InboxQueueStats> {
  const supabase = await createClient();

  const [pending, failed, deadLetter] = await Promise.all([
    supabase
      .from("agent_inbox_items")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "leased"]),
    supabase
      .from("agent_inbox_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("agent_inbox_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "dead_letter"),
  ]);

  return {
    pending: pending.count ?? 0,
    failed: failed.count ?? 0,
    dead_letter: deadLetter.count ?? 0,
  };
}

// ── Usage & Budgets ───────────────────────────────────────────────

async function fetchUsageBudgetData(): Promise<UsageBudgetData> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [budgetRes, usageRes] = await Promise.all([
    supabase
      .from("agent_budgets")
      .select(
        "agent_id, current_period_spend_usd, current_period_tokens, current_period_metered_calls, monthly_limit_usd, status, last_usage_at",
      ),
    supabase
      .from("agent_usage")
      .select("cost_total_usd, occurred_at")
      .gte("occurred_at", sevenDaysAgo)
      .order("occurred_at", { ascending: true }),
  ]);

  type BudgetRow = {
    agent_id: string;
    current_period_spend_usd: number;
    current_period_tokens: number;
    current_period_metered_calls: number;
    monthly_limit_usd: number | null;
    status: string;
    last_usage_at: string | null;
  };
  const budgets = (budgetRes.data ?? []) as unknown as BudgetRow[];

  const agentIds = budgets.map((b) => b.agent_id).filter(Boolean);
  const agentMap = new Map<string, { name: string; emoji: string | null }>();
  if (agentIds.length > 0) {
    const { data: agentsData } = await supabase
      .from("agents")
      .select("id, name, meta")
      .in("id", agentIds);
    for (const a of (agentsData ?? []) as { id: string; name: string; meta: Record<string, unknown> | null }[]) {
      agentMap.set(a.id, {
        name: a.name,
        emoji: (a.meta?.emoji as string) ?? null,
      });
    }
  }

  const agentBudgets: AgentBudgetDetail[] = budgets
    .map((b) => {
      const agent = agentMap.get(b.agent_id);
      return {
        agentId: b.agent_id,
        agentName: agent?.name ?? "Unknown",
        agentEmoji: agent?.emoji ?? null,
        status: b.status as AgentBudgetDetail["status"],
        spendUsd: b.current_period_spend_usd ?? 0,
        limitUsd: b.monthly_limit_usd,
        tokens: b.current_period_tokens ?? 0,
        meteredCalls: b.current_period_metered_calls ?? 0,
        lastUsageAt: b.last_usage_at,
      };
    })
    .sort((a, b) => b.spendUsd - a.spendUsd);

  const totalSpendUsd = agentBudgets.reduce((s, a) => s + a.spendUsd, 0);
  const totalTokens = agentBudgets.reduce((s, a) => s + a.tokens, 0);
  const budgetsWithLimits = agentBudgets.filter((a) => a.limitUsd !== null);
  const totalBudgetLimitUsd =
    budgetsWithLimits.length > 0
      ? budgetsWithLimits.reduce((s, a) => s + (a.limitUsd ?? 0), 0)
      : null;

  type UsageRow = { cost_total_usd: number | null; occurred_at: string };
  const usageRows = (usageRes.data ?? []) as UsageRow[];
  const dailyMap = new Map<string, number>();
  for (const row of usageRows) {
    const day = row.occurred_at.split("T")[0];
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + (row.cost_total_usd ?? 0));
  }
  const dailySpend7d: UsageBudgetData["dailySpend7d"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().split("T")[0];
    dailySpend7d.push({ day, spend_usd: dailyMap.get(day) ?? 0 });
  }

  return {
    totalSpendUsd,
    totalTokens,
    totalBudgetLimitUsd,
    agentBudgets,
    dailySpend7d,
    warnedCount: agentBudgets.filter((a) => a.status === "warned").length,
    exceededCount: agentBudgets.filter((a) => a.status === "exceeded").length,
  };
}

// ── Defaults ───────────────────────────────────────────────────────

const ZERO_CRM: CrmStats = {
  pipeline: [],
  totalContacts: 0,
  contactsAddedThisWeek: 0,
  followupsDue: 0,
  interactionsThisWeek: 0,
};

const ZERO_TASKS: TaskStats & { completionTrend7d: TaskCompletionDay[] } = {
  total: 0,
  todo: 0,
  inProgress: 0,
  blocked: 0,
  done: 0,
  overdue: 0,
  completionTrend7d: [],
};

const ZERO_SPEND: SpendSummary = {
  total_spend_usd: 0,
  total_tokens: 0,
  agent_count: 0,
  warned_count: 0,
  exceeded_count: 0,
  unmetered_count: 0,
  daily_spend_7d: [],
  top_spenders: [],
};

const ZERO_USAGE: UsageBudgetData = {
  totalSpendUsd: 0,
  totalTokens: 0,
  totalBudgetLimitUsd: null,
  agentBudgets: [],
  dailySpend7d: [],
  warnedCount: 0,
  exceededCount: 0,
};

const ZERO_CMD: CommandQueueStats = { pending: 0, running: 0, failed_24h: 0 };
const ZERO_INBOX: InboxQueueStats = { pending: 0, failed: 0, dead_letter: 0 };

// ── Main action ────────────────────────────────────────────────────

function determineDefaultTab(
  usage: UsageBudgetData,
  tasks: TaskStats,
  crm: CrmStats,
): PulseTab {
  if (usage.agentBudgets.length > 0) return "usage";
  if (tasks.overdue > 0 || tasks.blocked > 0) return "tasks";
  if (crm.followupsDue > 0) return "pipeline";
  return "tasks";
}

export async function fetchWorkspacePulse(): Promise<WorkspacePulseData> {
  await requireAuth();
  const [tasks, crm, spend, usage, gateways, commandQueue, inboxQueue] =
    await Promise.all([
      safe(fetchTaskStats, ZERO_TASKS),
      safe(fetchCrmStats, ZERO_CRM),
      safe(fetchSpendSummary, ZERO_SPEND),
      safe(fetchUsageBudgetData, ZERO_USAGE),
      safe(fetchGatewayStats, []),
      safe(fetchCommandQueueStats, ZERO_CMD),
      safe(fetchInboxQueueStats, ZERO_INBOX),
    ]);

  return {
    tasks,
    crm,
    spend,
    usage,
    gateways,
    commandQueue,
    inboxQueue,
    smartDefaultTab: determineDefaultTab(usage, tasks, crm),
  };
}
