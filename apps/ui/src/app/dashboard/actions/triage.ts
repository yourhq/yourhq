"use server";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";
import type { TriageItem } from "@/lib/types/dashboard";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error(`[triage] ${fn.name || "query"} failed:`, err.message || e);
    return fallback;
  }
}

// ── Fetch ──────────────────────────────────────────────────────────

export async function fetchTriageItems(): Promise<TriageItem[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date().toISOString();
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [overdueRes, blockedRes, deliverableRes, failedRes, budgetRes, followUpRes, notifRes] =
    await Promise.all([
      safe(async () => {
        const r = await supabase
          .from("tasks")
          .select("id, title, status, priority, due_date")
          .in("status", ["todo", "in_progress", "blocked"])
          .lt("due_date", today)
          .is("archived_at", null)
          .order("due_date", { ascending: true })
          .limit(5);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("tasks")
          .select("id, title, priority, updated_at")
          .eq("status", "blocked")
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(3);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("entity_links")
          .select(
            "id, label, created_at, review_status, owner_id, submitted_by_agent:agents!entity_links_submitted_by_agent_id_fkey(name, meta), owner_task:tasks!entity_links_owner_id_fkey(title)",
          )
          .eq("is_deliverable", true)
          .eq("review_status", "in_review")
          .order("created_at", { ascending: false })
          .limit(5);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("agent_inbox_items")
          .select(
            "id, summary, created_at, agent:agents!agent_inbox_items_agent_id_fkey(name, meta)",
          )
          .eq("status", "dead_letter")
          .gte("created_at", twoDaysAgo)
          .order("created_at", { ascending: false })
          .limit(3);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("agent_budgets")
          .select(
            "agent_id, status, current_period_spend_usd, monthly_limit_usd",
          )
          .in("status", ["warned", "exceeded"])
          .limit(5);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("interactions")
          .select(
            "id, contact_id, next_action, next_action_date, contact:contacts(name)",
          )
          .not("next_action_date", "is", null)
          .lte("next_action_date", now)
          .order("next_action_date", { ascending: true })
          .limit(5);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("notifications")
          .select("id, type, title, body, entity_type, entity_id, created_at")
          .is("read_at", null)
          .is("dismissed_at", null)
          .order("created_at", { ascending: false })
          .limit(3);
        return r.data ?? [];
      }, []),
    ]);

  const items: TriageItem[] = [];
  const seenTaskIds = new Set<string>();

  // Overdue tasks
  type OverdueRow = { id: string; title: string; status: string; priority: string | null; due_date: string };
  for (const t of overdueRes as unknown as OverdueRow[]) {
    seenTaskIds.add(t.id);
    items.push({
      id: `overdue-${t.id}`,
      type: "overdue_task",
      title: t.title,
      subtitle: `${t.priority ?? "medium"} · overdue`,
      href: "/dashboard/tasks",
      urgency: 0,
      timestamp: t.due_date,
      agentName: null,
      agentEmoji: null,
      entityId: t.id,
      entityType: "task",
      actions: [
        { key: "extend", label: "Extend", variant: "outline" },
        { key: "view", label: "View", variant: "default" },
      ],
    });
  }

  // Blocked tasks (skip if already in overdue)
  type BlockedRow = { id: string; title: string; priority: string | null; updated_at: string };
  for (const t of blockedRes as unknown as BlockedRow[]) {
    if (seenTaskIds.has(t.id)) continue;
    items.push({
      id: `blocked-${t.id}`,
      type: "blocked_task",
      title: t.title,
      subtitle: `${t.priority ?? "medium"} · blocked`,
      href: "/dashboard/tasks",
      urgency: 1,
      timestamp: t.updated_at,
      agentName: null,
      agentEmoji: null,
      entityId: t.id,
      entityType: "task",
      actions: [{ key: "view", label: "View", variant: "default" }],
    });
  }

  // Deliverables awaiting review
  type DeliverableRow = {
    id: string;
    label: string | null;
    created_at: string;
    review_status: string;
    owner_id: string;
    submitted_by_agent: { name: string; meta: Record<string, unknown> | null }[] | null;
    owner_task: { title: string }[] | null;
  };
  for (const d of deliverableRes as unknown as DeliverableRow[]) {
    const agent = d.submitted_by_agent?.[0] ?? null;
    const task = d.owner_task?.[0] ?? null;
    items.push({
      id: `deliverable-${d.id}`,
      type: "deliverable_review",
      title: d.label ?? "Deliverable",
      subtitle: task?.title ? `on "${task.title}"` : null,
      href: "/dashboard/tasks",
      urgency: 2,
      timestamp: d.created_at,
      agentName: agent?.name ?? null,
      agentEmoji: (agent?.meta?.emoji as string) ?? null,
      entityId: d.id,
      entityType: "entity_link",
      actions: [
        { key: "approve", label: "Approve", variant: "default" },
        { key: "revise", label: "Revise", variant: "outline" },
      ],
    });
  }

  // Failed agent work
  type FailedRow = {
    id: string;
    summary: string | null;
    created_at: string;
    agent: { name: string; meta: Record<string, unknown> | null }[] | null;
  };
  for (const f of failedRes as unknown as FailedRow[]) {
    const agent = f.agent?.[0] ?? null;
    items.push({
      id: `failed-${f.id}`,
      type: "failed_work",
      title: f.summary ?? "Failed work item",
      subtitle: null,
      href: "/dashboard/agents",
      urgency: 1,
      timestamp: f.created_at,
      agentName: agent?.name ?? null,
      agentEmoji: (agent?.meta?.emoji as string) ?? null,
      entityId: f.id,
      entityType: "agent_inbox_item",
      actions: [
        { key: "retry", label: "Retry", variant: "outline" },
        { key: "dismiss", label: "Dismiss", variant: "outline" },
      ],
    });
  }

  // Budget warnings
  type BudgetRow = {
    agent_id: string;
    status: string;
    current_period_spend_usd: number;
    monthly_limit_usd: number | null;
  };
  const budgetItems = budgetRes as unknown as BudgetRow[];
  const budgetAgentIds = budgetItems.map((b) => b.agent_id).filter(Boolean);
  const budgetAgentMap = new Map<string, { name: string; emoji: string | null }>();
  if (budgetAgentIds.length > 0) {
    const { data: agentsData } = await supabase
      .from("agents")
      .select("id, name, meta")
      .in("id", budgetAgentIds);
    for (const a of (agentsData ?? []) as { id: string; name: string; meta: Record<string, unknown> | null }[]) {
      budgetAgentMap.set(a.id, {
        name: a.name,
        emoji: (a.meta?.emoji as string) ?? null,
      });
    }
  }
  for (const b of budgetItems) {
    const agent = budgetAgentMap.get(b.agent_id);
    items.push({
      id: `budget-${b.agent_id}`,
      type: "budget_warning",
      title: `${agent?.name ?? "Agent"} ${b.status === "exceeded" ? "exceeded budget" : "approaching budget limit"}`,
      subtitle: `$${b.current_period_spend_usd.toFixed(2)}${b.monthly_limit_usd ? ` / $${b.monthly_limit_usd.toFixed(2)}` : ""}`,
      href: "/dashboard/agents",
      urgency: b.status === "exceeded" ? 0 : 3,
      timestamp: "",
      agentName: agent?.name ?? null,
      agentEmoji: agent?.emoji ?? null,
      entityId: b.agent_id,
      entityType: "agent_budget",
      actions: [{ key: "view", label: "Manage", variant: "outline" }],
    });
  }

  // Follow-ups
  type FollowUpRow = {
    id: string;
    contact_id: string;
    next_action: string | null;
    next_action_date: string;
    contact: { name: string }[] | null;
  };
  for (const row of followUpRes as unknown as FollowUpRow[]) {
    items.push({
      id: `followup-${row.id}`,
      type: "follow_up",
      title: row.contact?.[0]?.name ?? "Unknown contact",
      subtitle: row.next_action,
      href: `/dashboard/contacts/${row.contact_id}`,
      urgency: 4,
      timestamp: row.next_action_date,
      agentName: null,
      agentEmoji: null,
      entityId: row.id,
      entityType: "interaction",
      actions: [
        { key: "snooze", label: "Snooze", variant: "outline" },
        { key: "view", label: "View", variant: "default" },
      ],
    });
  }

  // Notifications
  type NotifRow = {
    id: string;
    type: string;
    title: string;
    body: string | null;
    entity_type: string | null;
    entity_id: string | null;
    created_at: string;
  };
  for (const n of notifRes as unknown as NotifRow[]) {
    items.push({
      id: `notif-${n.id}`,
      type: "notification",
      title: n.title,
      subtitle: n.body,
      href: "/dashboard/notifications",
      urgency: 5,
      timestamp: n.created_at,
      agentName: null,
      agentEmoji: null,
      entityId: n.id,
      entityType: "notification",
      actions: [{ key: "dismiss", label: "Dismiss", variant: "outline" }],
    });
  }

  items.sort((a, b) => a.urgency - b.urgency);
  return items.slice(0, 12);
}

// ── Mutations ──────────────────────────────────────────────────────

export async function approveDeliverable(
  deliverableId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("entity_links")
    .update({
      review_status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", deliverableId);

  if (error) return { ok: false, error: error.message };

  logAudit(supabase, {
    module: "entity_links",
    entity_type: "entity_link",
    entity_id: deliverableId,
    action: "updated",
    summary: "Deliverable approved from dashboard triage",
  });

  return { ok: true };
}

export async function requestDeliverableRevision(
  deliverableId: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("entity_links")
    .update({
      review_status: "revision_requested",
      review_note: note,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", deliverableId);

  if (error) return { ok: false, error: error.message };

  logAudit(supabase, {
    module: "entity_links",
    entity_type: "entity_link",
    entity_id: deliverableId,
    action: "updated",
    summary: "Deliverable revision requested from dashboard triage",
  });

  return { ok: true };
}

export async function extendTaskDeadline(
  taskId: string,
  newDueDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("tasks")
    .update({ due_date: newDueDate })
    .eq("id", taskId);

  if (error) return { ok: false, error: error.message };

  logAudit(supabase, {
    module: "tasks",
    entity_type: "task",
    entity_id: taskId,
    action: "updated",
    summary: `Task deadline extended to ${newDueDate}`,
  });

  return { ok: true };
}

export async function retryFailedInboxItem(
  itemId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("agent_inbox_items")
    .update({
      status: "pending",
      attempt_count: 0,
      failed_at: null,
    })
    .eq("id", itemId);

  if (error) return { ok: false, error: error.message };

  logAudit(supabase, {
    module: "agents",
    entity_type: "agent_inbox_item",
    entity_id: itemId,
    action: "updated",
    summary: "Failed inbox item retried from dashboard triage",
  });

  return { ok: true };
}

export async function snoozeFollowUp(
  interactionId: string,
  untilDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("interactions")
    .update({ next_action_date: untilDate })
    .eq("id", interactionId);

  if (error) return { ok: false, error: error.message };

  logAudit(supabase, {
    module: "crm",
    entity_type: "interaction",
    entity_id: interactionId,
    action: "updated",
    summary: `Follow-up snoozed until ${untilDate}`,
  });

  return { ok: true };
}

export async function dismissTriageNotification(
  notificationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("notifications")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
