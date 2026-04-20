"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  DashboardStats,
  CrmStats,
  TaskStats,
  AgentStats,
  PipelineStageCount,
  FollowUpDue,
} from "@/lib/types/dashboard";
import type { PipelineStage } from "@/lib/fields/types";
import type { AuditLogEntry } from "@/lib/audit/types";

// ── CRM stats (Supabase only) ───────────────────────────────────────

async function fetchCrmStats(): Promise<CrmStats> {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Load pipeline stages first so we know which statuses to count.
  const { data: stagesData } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("entity_type", "contact")
    .order("sort_order", { ascending: true });

  const stages = (stagesData ?? []) as PipelineStage[];

  // Count contacts per stage in parallel.
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

  // Contacts added this week
  const { count: contactsThisWeek } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo)
    .is("archived_at", null);

  // Follow-ups due (from interactions.next_action_date)
  const { count: followupsDue } = await supabase
    .from("interactions")
    .select("*", { count: "exact", head: true })
    .not("next_action_date", "is", null)
    .lte("next_action_date", new Date().toISOString());

  // Interactions this week
  const { count: interactionsThisWeek } = await supabase
    .from("interactions")
    .select("*", { count: "exact", head: true })
    .gte("occurred_at", sevenDaysAgo);

  return {
    pipeline,
    totalContacts,
    contactsAddedThisWeek: contactsThisWeek ?? 0,
    followupsDue: followupsDue ?? 0,
    interactionsThisWeek: interactionsThisWeek ?? 0,
  };
}

// ── Supabase task stats ─────────────────────────────────────────────

async function fetchTaskStats(): Promise<TaskStats> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const statuses = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
  const counts = await Promise.all(
    statuses.map((s) =>
      supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("status", s)
        .is("archived_at", null)
    )
  );

  const byStatus: Record<string, number> = {};
  let total = 0;
  statuses.forEach((s, i) => {
    const c = counts[i].count ?? 0;
    byStatus[s] = c;
    total += c;
  });

  const { count: overdue } = await supabase
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .in("status", ["todo", "in_progress", "blocked"])
    .lt("due_date", today);

  return {
    total,
    todo: byStatus.todo ?? 0,
    inProgress: byStatus.in_progress ?? 0,
    blocked: byStatus.blocked ?? 0,
    done: byStatus.done ?? 0,
    overdue: overdue ?? 0,
  };
}

// ── Supabase agent stats ────────────────────────────────────────────

async function fetchAgentStats(): Promise<AgentStats> {
  const supabase = await createClient();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const agentStatuses = ["online", "offline", "error", "paused"] as const;
  const counts = await Promise.all(
    agentStatuses.map((s) =>
      supabase.from("agents").select("*", { count: "exact", head: true }).eq("status", s)
    )
  );

  let total = 0;
  const byStatus: Record<string, number> = {};
  agentStatuses.forEach((s, i) => {
    const c = counts[i].count ?? 0;
    byStatus[s] = c;
    total += c;
  });

  const { count: recentActions } = await supabase
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("actor_type", "agent")
    .gte("created_at", dayAgo);

  return {
    total,
    online: byStatus.online ?? 0,
    offline: byStatus.offline ?? 0,
    error: byStatus.error ?? 0,
    recentActions: recentActions ?? 0,
  };
}

// ── Follow-ups due ──────────────────────────────────────────────────

async function fetchFollowUpsDue(): Promise<FollowUpDue[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("interactions")
    .select("id, contact_id, next_action, next_action_date, contact:contacts(id, name)")
    .not("next_action_date", "is", null)
    .lte("next_action_date", now)
    .order("next_action_date", { ascending: true })
    .limit(20);

  if (!data) return [];

  return (data as unknown as Array<{
    id: string;
    contact_id: string;
    next_action: string | null;
    next_action_date: string;
    contact: { id: string; name: string } | null;
  }>).map((row) => ({
    interaction_id: row.id,
    contact_id: row.contact_id,
    contact_name: row.contact?.name ?? "Unknown",
    next_action: row.next_action,
    next_action_date: row.next_action_date,
  }));
}

// ── Recent activity ─────────────────────────────────────────────────

async function fetchRecentActivity(): Promise<AuditLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("*, actor_agent:agents(id, name, slug, avatar_url)")
    .order("created_at", { ascending: false })
    .limit(10);
  return (data as AuditLogEntry[] | null) ?? [];
}

// ── Helpers ──────────────────────────────────────────────────────────

const ZERO_CRM: CrmStats = {
  pipeline: [],
  totalContacts: 0,
  contactsAddedThisWeek: 0,
  followupsDue: 0,
  interactionsThisWeek: 0,
};
const ZERO_TASKS: TaskStats = {
  total: 0, todo: 0, inProgress: 0, blocked: 0, done: 0, overdue: 0,
};
const ZERO_AGENTS: AgentStats = {
  total: 0, online: 0, offline: 0, error: 0, recentActions: 0,
};

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    const err = e as { message?: string; details?: string };
    console.error(`[dashboard] ${fn.name || "query"} failed:`, err.message || e);
    return fallback;
  }
}

// ── Main action ──────────────────────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const [crm, tasks, agents, followUps, recentActivity] = await Promise.all([
    safe(fetchCrmStats, ZERO_CRM),
    safe(fetchTaskStats, ZERO_TASKS),
    safe(fetchAgentStats, ZERO_AGENTS),
    safe(fetchFollowUpsDue, [] as FollowUpDue[]),
    safe(fetchRecentActivity, [] as AuditLogEntry[]),
  ]);

  return {
    crm,
    tasks,
    agents,
    followUps,
    recentActivity,
    fetchedAt: new Date().toISOString(),
  };
}
