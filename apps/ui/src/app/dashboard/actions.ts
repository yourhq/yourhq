"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  DashboardStats,
  CrmStats,
  TaskStats,
  PipelineStageCount,
  DashboardAlert,
  GatewaySummary,
  CommandQueueStats,
  InboxQueueStats,
  ActionItem,
  SpendSummary,
  AgentFleetItem,
} from "@/lib/types/dashboard";
import type { PipelineStage } from "@/lib/fields/types";
import type { AuditLogEntry } from "@/lib/audit/types";

// ── Alerts ──────────────────────────────────────────────────────────

async function fetchAlerts(): Promise<DashboardAlert[]> {
  const supabase = await createClient();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const alerts: DashboardAlert[] = [];

  const [gatewayRes, agentRes, budgetRes, commandRes, inboxRes] =
    await Promise.all([
      supabase
        .from("gateways")
        .select("id, slug, label, status")
        .neq("status", "ready"),
      supabase
        .from("agents")
        .select("*", { count: "exact", head: true })
        .eq("status", "error"),
      supabase
        .from("agent_budgets")
        .select("*", { count: "exact", head: true })
        .eq("status", "exceeded"),
      supabase
        .from("agent_commands")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", dayAgo),
      supabase
        .from("agent_inbox_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "dead_letter"),
    ]);

  if (gatewayRes.data?.length) {
    for (const gw of gatewayRes.data) {
      alerts.push({
        id: `gw-${gw.id}`,
        severity: "error",
        category: "gateway",
        message: `Gateway '${gw.label || gw.slug}' is ${gw.status}`,
        href: "/dashboard/settings/gateways",
      });
    }
  }
  if (agentRes.count && agentRes.count > 0) {
    alerts.push({
      id: "agent-errors",
      severity: "error",
      category: "agent",
      message: `${agentRes.count} agent${agentRes.count > 1 ? "s" : ""} in error state`,
      href: "/dashboard/agents",
    });
  }
  if (budgetRes.count && budgetRes.count > 0) {
    alerts.push({
      id: "budget-exceeded",
      severity: "warning",
      category: "budget",
      message: `${budgetRes.count} agent${budgetRes.count > 1 ? "s" : ""} exceeded budget`,
      href: "/dashboard/agents",
    });
  }
  if (commandRes.count && commandRes.count > 0) {
    alerts.push({
      id: "cmd-failed",
      severity: "warning",
      category: "command",
      message: `${commandRes.count} command${commandRes.count > 1 ? "s" : ""} failed in the last 24 hours`,
      href: "/dashboard/agents",
    });
  }
  if (inboxRes.count && inboxRes.count > 0) {
    alerts.push({
      id: "inbox-dead",
      severity: "warning",
      category: "inbox",
      message: `${inboxRes.count} inbox item${inboxRes.count > 1 ? "s" : ""} in dead letter`,
      href: "/dashboard/agents",
    });
  }

  return alerts;
}

// ── Agent fleet ─────────────────────────────────────────────────────

const AGENT_STATUS_ORDER: Record<string, number> = {
  error: 0,
  ready: 1,
  paused: 2,
  provisioning: 3,
  hibernating: 4,
};

async function fetchAgentFleet(): Promise<AgentFleetItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agents")
    .select("id, name, slug, status, last_seen_at, avatar_url")
    .limit(10);

  if (!data) return [];

  return (data as AgentFleetItem[]).sort(
    (a, b) =>
      (AGENT_STATUS_ORDER[a.status] ?? 9) -
      (AGENT_STATUS_ORDER[b.status] ?? 9)
  );
}

// ── Gateway stats ───────────────────────────────────────────────────

async function fetchGatewayStats(): Promise<{
  total: number;
  online: number;
  gateways: GatewaySummary[];
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("gateways")
    .select("id, slug, label, status, last_seen_at");

  const gateways = (data ?? []) as GatewaySummary[];
  return {
    total: gateways.length,
    online: gateways.filter((g) => g.status === "ready").length,
    gateways,
  };
}

// ── Command queue ───────────────────────────────────────────────────

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

// ── Inbox queue ─────────────────────────────────────────────────────

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

// ── Action items (needs attention) ──────────────────────────────────

async function fetchActionItems(): Promise<ActionItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();

  const [overdueRes, blockedRes, followUpRes, notifRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date")
      .in("status", ["todo", "in_progress", "blocked"])
      .lt("due_date", today)
      .is("archived_at", null)
      .order("due_date", { ascending: true })
      .limit(5),
    supabase
      .from("tasks")
      .select("id, title, priority")
      .eq("status", "blocked")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("interactions")
      .select(
        "id, contact_id, next_action, next_action_date, contact:contacts(name)"
      )
      .not("next_action_date", "is", null)
      .lte("next_action_date", now)
      .order("next_action_date", { ascending: true })
      .limit(5),
    supabase
      .from("notifications")
      .select("id, type, title, body, entity_type, entity_id, created_at")
      .is("read_at", null)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const items: ActionItem[] = [];

  for (const t of overdueRes.data ?? []) {
    items.push({
      id: `overdue-${t.id}`,
      type: "overdue_task",
      title: t.title,
      subtitle: `${t.priority ?? "medium"} · overdue`,
      href: `/dashboard/tasks`,
      urgency: 0,
      timestamp: t.due_date,
    });
  }

  for (const t of blockedRes.data ?? []) {
    if (items.some((i) => i.id === `overdue-${t.id}`)) continue;
    items.push({
      id: `blocked-${t.id}`,
      type: "blocked_task",
      title: t.title,
      subtitle: `${t.priority ?? "medium"} · blocked`,
      href: `/dashboard/tasks`,
      urgency: 1,
      timestamp: "",
    });
  }

  type FollowUpRow = {
    id: string;
    contact_id: string;
    next_action: string | null;
    next_action_date: string;
    contact: { name: string } | null;
  };
  for (const row of (followUpRes.data ?? []) as unknown as FollowUpRow[]) {
    items.push({
      id: `followup-${row.id}`,
      type: "follow_up",
      title: row.contact?.name ?? "Unknown contact",
      subtitle: row.next_action,
      href: `/dashboard/contacts/${row.contact_id}`,
      urgency: 2,
      timestamp: row.next_action_date,
    });
  }

  for (const n of notifRes.data ?? []) {
    const nr = n as {
      id: string;
      type: string;
      title: string;
      body: string | null;
      entity_type: string | null;
      entity_id: string | null;
      created_at: string;
    };
    items.push({
      id: `notif-${nr.id}`,
      type: "notification",
      title: nr.title,
      subtitle: nr.body,
      href: "/dashboard/notifications",
      urgency: 3,
      timestamp: nr.created_at,
    });
  }

  items.sort((a, b) => a.urgency - b.urgency);
  return items.slice(0, 8);
}

// ── CRM stats ───────────────────────────────────────────────────────

async function fetchCrmStats(): Promise<CrmStats> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
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
        .is("archived_at", null)
    )
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

// ── Task stats ──────────────────────────────────────────────────────

async function fetchTaskStats(): Promise<TaskStats> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const statuses = [
    "todo",
    "in_progress",
    "blocked",
    "done",
    "cancelled",
  ] as const;
  const [counts, overdueRes] = await Promise.all([
    Promise.all(
      statuses.map((s) =>
        supabase
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("status", s)
          .is("archived_at", null)
      )
    ),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .in("status", ["todo", "in_progress", "blocked"])
      .lt("due_date", today),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  statuses.forEach((s, i) => {
    const c = counts[i].count ?? 0;
    byStatus[s] = c;
    total += c;
  });

  return {
    total,
    todo: byStatus.todo ?? 0,
    inProgress: byStatus.in_progress ?? 0,
    blocked: byStatus.blocked ?? 0,
    done: byStatus.done ?? 0,
    overdue: overdueRes.count ?? 0,
  };
}

// ── Spend summary ───────────────────────────────────────────────────

async function fetchSpendSummary(): Promise<SpendSummary> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [budgetRes, usageRes] = await Promise.all([
    supabase
      .from("agent_budgets")
      .select("agent_id, current_period_spend_usd, current_period_tokens, status"),
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
    0
  );
  const total_tokens = budgets.reduce(
    (s, r) => s + (r.current_period_tokens ?? 0),
    0
  );

  // Daily spend for sparkline
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

  // Top spenders — resolve names from agents table
  const topBudgets = [...budgets]
    .sort(
      (a, b) =>
        (b.current_period_spend_usd ?? 0) - (a.current_period_spend_usd ?? 0)
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
        topBudgets.map((b) => b.agent_id)
      );
    const nameMap = new Map(
      (agentNames ?? []).map((a: { id: string; name: string }) => [
        a.id,
        a.name,
      ])
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

// ── Recent activity ─────────────────────────────────────────────────

async function fetchRecentActivity(): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*, actor_agent:agents(id, name, slug, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(5);
  return (data as AuditLogEntry[] | null) ?? [];
}

// ── Helpers ─────────────────────────────────────────────────────────

const ZERO_CRM: CrmStats = {
  pipeline: [],
  totalContacts: 0,
  contactsAddedThisWeek: 0,
  followupsDue: 0,
  interactionsThisWeek: 0,
};

const ZERO_TASKS: TaskStats = {
  total: 0,
  todo: 0,
  inProgress: 0,
  blocked: 0,
  done: 0,
  overdue: 0,
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

const ZERO_CMD: CommandQueueStats = { pending: 0, running: 0, failed_24h: 0 };
const ZERO_INBOX: InboxQueueStats = { pending: 0, failed: 0, dead_letter: 0 };

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error(
      `[dashboard] ${fn.name || "query"} failed:`,
      err.message || e
    );
    return fallback;
  }
}

// ── Main action ─────────────────────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [
    alerts,
    agentFleet,
    gatewayStats,
    commandQueue,
    inboxQueue,
    actionItems,
    crm,
    tasks,
    spend,
    recentActivity,
  ] = await Promise.all([
    safe(fetchAlerts, []),
    safe(fetchAgentFleet, []),
    safe(fetchGatewayStats, { total: 0, online: 0, gateways: [] }),
    safe(fetchCommandQueueStats, ZERO_CMD),
    safe(fetchInboxQueueStats, ZERO_INBOX),
    safe(fetchActionItems, []),
    safe(fetchCrmStats, ZERO_CRM),
    safe(fetchTaskStats, ZERO_TASKS),
    safe(fetchSpendSummary, ZERO_SPEND),
    safe(fetchRecentActivity, []),
  ]);

  return {
    alerts,
    agentCounts: {
      online: agentFleet.filter((a) => a.status === "ready").length,
      total: agentFleet.length,
      error: agentFleet.filter((a) => a.status === "error").length,
    },
    gatewayCounts: { online: gatewayStats.online, total: gatewayStats.total },
    activeTaskCount: tasks.todo + tasks.inProgress + tasks.blocked,
    overdueCount: tasks.overdue,
    followUpCount: crm.followupsDue,
    actionItems,
    agentFleet,
    gateways: gatewayStats.gateways,
    commandQueue,
    inboxQueue,
    crm,
    tasks,
    spend,
    recentActivity,
    fetchedAt: new Date().toISOString(),
  };
}

const EXPECTED_SCHEMA_VERSION = 25;

export async function getSchemaVersionAction(): Promise<{
  current: number | null;
  expected: number;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("_schema_version")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    current: data?.version ?? null,
    expected: EXPECTED_SCHEMA_VERSION,
  };
}
