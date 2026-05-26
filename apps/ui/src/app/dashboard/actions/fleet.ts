"use server";

import { createClient } from "@/lib/supabase/server";
import type { AgentFleetEnriched } from "@/lib/types/dashboard";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error(`[fleet] ${fn.name || "query"} failed:`, err.message || e);
    return fallback;
  }
}

const STATUS_PRIORITY: Record<string, number> = {
  error: 0,
  ready: 1,
  paused: 2,
  provisioning: 3,
  hibernating: 4,
};

export async function fetchAgentFleetEnriched(): Promise<AgentFleetEnriched[]> {
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const [agentsRes, leasedRes, runningRes, todayTasksRes, todaySpendRes] =
    await Promise.all([
      safe(async () => {
        const r = await supabase
          .from("agents")
          .select(
            "id, name, slug, status, last_seen_at, avatar_url, meta, domains, description",
          )
          .limit(12);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("agent_inbox_items")
          .select("agent_id, summary, task:tasks(title)")
          .eq("status", "leased");
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("agent_commands")
          .select("agent_id, action, started_at")
          .eq("status", "running");
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("tasks")
          .select("assignee_agent_id")
          .eq("status", "done")
          .not("assignee_agent_id", "is", null)
          .gte("completed_at", todayISO)
          .is("archived_at", null);
        return r.data ?? [];
      }, []),
      safe(async () => {
        const r = await supabase
          .from("agent_usage")
          .select("agent_id, cost_total_usd")
          .gte("occurred_at", todayISO);
        return r.data ?? [];
      }, []),
    ]);

  type AgentRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    last_seen_at: string | null;
    avatar_url: string | null;
    meta: Record<string, unknown> | null;
    domains: string[] | null;
    description: string | null;
  };
  type InboxRow = {
    agent_id: string;
    summary: string | null;
    task: { title: string }[] | null;
  };
  type CommandRow = { agent_id: string; action: string; started_at: string | null };
  type TaskRow = { assignee_agent_id: string };
  type UsageRow = { agent_id: string; cost_total_usd: number | null };

  const agents = agentsRes as unknown as AgentRow[];
  const leased = leasedRes as unknown as InboxRow[];
  const running = runningRes as unknown as CommandRow[];
  const todayTasks = todayTasksRes as unknown as TaskRow[];
  const todaySpend = todaySpendRes as unknown as UsageRow[];

  const leasedByAgent = new Map<string, InboxRow>();
  for (const item of leased) {
    if (!leasedByAgent.has(item.agent_id)) {
      leasedByAgent.set(item.agent_id, item);
    }
  }

  const runningByAgent = new Map<string, CommandRow>();
  for (const cmd of running) {
    if (!runningByAgent.has(cmd.agent_id)) {
      runningByAgent.set(cmd.agent_id, cmd);
    }
  }

  const taskCountByAgent = new Map<string, number>();
  for (const t of todayTasks) {
    taskCountByAgent.set(
      t.assignee_agent_id,
      (taskCountByAgent.get(t.assignee_agent_id) ?? 0) + 1,
    );
  }

  const spendByAgent = new Map<string, number>();
  for (const u of todaySpend) {
    spendByAgent.set(
      u.agent_id,
      (spendByAgent.get(u.agent_id) ?? 0) + (u.cost_total_usd ?? 0),
    );
  }

  const enriched: AgentFleetEnriched[] = agents.map((agent) => {
    const inbox = leasedByAgent.get(agent.id);
    const cmd = runningByAgent.get(agent.id);

    let currentWork: string | null = null;
    let currentWorkType: "active" | "idle" | null = null;

    if (inbox) {
      currentWork =
        (inbox.task && inbox.task.length > 0 ? inbox.task[0].title : null) ??
        inbox.summary ??
        "Processing work item";
      currentWorkType = "active";
    } else if (cmd) {
      currentWork = `Running: ${cmd.action}`;
      currentWorkType = "active";
    }

    return {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
      status: agent.status,
      emoji: (agent.meta?.emoji as string) ?? null,
      role: (agent.meta?.team as string) ?? agent.domains?.[0] ?? null,
      description: agent.description,
      last_seen_at: agent.last_seen_at,
      avatar_url: agent.avatar_url,
      currentWork,
      currentWorkType,
      lastActivity: null,
      lastActivityAt: agent.last_seen_at,
      todayTasksCompleted: taskCountByAgent.get(agent.id) ?? 0,
      todaySpendUsd: spendByAgent.get(agent.id) ?? 0,
    };
  });

  enriched.sort((a, b) => {
    const aPri = STATUS_PRIORITY[a.status] ?? 9;
    const bPri = STATUS_PRIORITY[b.status] ?? 9;
    if (aPri !== bPri) return aPri - bPri;
    if (a.currentWorkType === "active" && b.currentWorkType !== "active") return -1;
    if (b.currentWorkType === "active" && a.currentWorkType !== "active") return 1;
    return a.name.localeCompare(b.name);
  });

  return enriched;
}
