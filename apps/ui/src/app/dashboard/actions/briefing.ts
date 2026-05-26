"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/require-auth";
import type { BriefingSummary, BriefingAgentUpdate } from "@/lib/types/dashboard";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error(`[briefing] ${fn.name || "query"} failed:`, err.message || e);
    return fallback;
  }
}

export async function fetchBriefing(since: string): Promise<BriefingSummary> {
  await requireAuth();
  const supabase = await createClient();

  const [
    workspaceRes,
    completedRes,
    deliverableCount,
    failedCount,
    spendTotal,
    newContactCount,
    skillCount,
  ] = await Promise.all([
    safe(async () => {
      const r = await supabase
        .from("workspace")
        .select("owner_preferred_name")
        .limit(1)
        .maybeSingle();
      return r.data as { owner_preferred_name: string | null } | null;
    }, null),
    safe(async () => {
      const r = await supabase
        .from("tasks")
        .select("id, title, assignee_agent_id")
        .eq("status", "done")
        .not("assignee_agent_id", "is", null)
        .gte("completed_at", since)
        .order("completed_at", { ascending: false })
        .limit(30);
      return r.data ?? [];
    }, []),
    safe(async () => {
      const r = await supabase
        .from("entity_links")
        .select("*", { count: "exact", head: true })
        .eq("is_deliverable", true)
        .eq("review_status", "in_review");
      return r.count ?? 0;
    }, 0),
    safe(async () => {
      const r = await supabase
        .from("agent_inbox_items")
        .select("*", { count: "exact", head: true })
        .eq("status", "dead_letter")
        .gte("created_at", since);
      return r.count ?? 0;
    }, 0),
    safe(async () => {
      const r = await supabase
        .from("agent_usage")
        .select("cost_total_usd")
        .gte("occurred_at", since);
      const rows = (r.data ?? []) as { cost_total_usd: number | null }[];
      return rows.reduce((s, row) => s + (row.cost_total_usd ?? 0), 0);
    }, 0),
    safe(async () => {
      const r = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since)
        .is("archived_at", null);
      return r.count ?? 0;
    }, 0),
    safe(async () => {
      const r = await supabase
        .from("audit_log")
        .select("*", { count: "exact", head: true })
        .eq("module", "knowledge")
        .eq("actor_type", "agent")
        .in("action", ["created", "updated"])
        .gte("created_at", since);
      return r.count ?? 0;
    }, 0),
  ]);

  type CompletedRow = {
    id: string;
    title: string;
    assignee_agent_id: string;
  };
  const completed = completedRes as unknown as CompletedRow[];

  const agentTaskMap = new Map<
    string,
    { titles: string[] }
  >();
  for (const row of completed) {
    const existing = agentTaskMap.get(row.assignee_agent_id);
    if (existing) {
      existing.titles.push(row.title);
    } else {
      agentTaskMap.set(row.assignee_agent_id, { titles: [row.title] });
    }
  }

  const agentIds = Array.from(agentTaskMap.keys());
  const agentNameMap = new Map<string, { name: string; emoji: string | null }>();
  if (agentIds.length > 0) {
    const { data: agentsData } = await supabase
      .from("agents")
      .select("id, name, meta")
      .in("id", agentIds);
    for (const a of (agentsData ?? []) as { id: string; name: string; meta: Record<string, unknown> | null }[]) {
      agentNameMap.set(a.id, {
        name: a.name,
        emoji: (a.meta?.emoji as string) ?? null,
      });
    }
  }

  const agentUpdates: BriefingAgentUpdate[] = Array.from(agentTaskMap.entries())
    .map(([agentId, { titles }]) => {
      const agent = agentNameMap.get(agentId);
      return {
        agentEmoji: agent?.emoji ?? null,
        agentName: agent?.name ?? "Agent",
        taskTitles: titles.slice(0, 3),
      };
    })
    .sort((a, b) => b.taskTitles.length - a.taskTitles.length)
    .slice(0, 4);

  return {
    ownerPreferredName: workspaceRes?.owner_preferred_name ?? null,
    since,
    agentUpdates,
    deliverablesAwaitingReview: deliverableCount,
    failedItems: failedCount,
    spendSinceUsd: spendTotal,
    newContacts: newContactCount,
    skillsLearned: skillCount,
  };
}
