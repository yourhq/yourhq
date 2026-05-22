import { getServiceClient } from "./supabase";

export interface InboxItem {
  id: string;
  agent_id: string;
  event_type: string;
  task_id: string;
  status: string;
  summary: string;
  context: Record<string, unknown>;
  completed_at: string | null;
  failed_at: string | null;
  attempt_count: number;
}

export interface UsageRow {
  id: string;
  agent_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_total_usd: number;
  occurred_at: string;
  run_id: string;
}

/**
 * Wait for an inbox item to reach a terminal status (done or failed/dead_letter).
 * Polls every 5s up to timeoutMs (default 180s — generous for LLM calls).
 */
export async function waitForInboxCompletion(
  taskId: string,
  opts?: { timeoutMs?: number; pollMs?: number }
): Promise<InboxItem> {
  const timeout = opts?.timeoutMs ?? 180_000;
  const poll = opts?.pollMs ?? 5_000;
  const deadline = Date.now() + timeout;
  const sb = getServiceClient();

  while (Date.now() < deadline) {
    const { data } = await sb
      .from("agent_inbox_items")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(1);

    const item = data?.[0] as InboxItem | undefined;
    if (item && (item.status === "done" || item.status === "failed" || item.status === "dead_letter")) {
      return item;
    }

    await new Promise((r) => setTimeout(r, poll));
  }

  throw new Error(`Inbox item for task ${taskId} did not complete within ${timeout}ms`);
}

/**
 * Wait for a task's status to change to a target value.
 */
export async function waitForTaskStatus(
  taskId: string,
  targetStatus: string | string[],
  opts?: { timeoutMs?: number; pollMs?: number }
): Promise<Record<string, unknown>> {
  const timeout = opts?.timeoutMs ?? 180_000;
  const poll = opts?.pollMs ?? 5_000;
  const deadline = Date.now() + timeout;
  const sb = getServiceClient();
  const statuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];

  while (Date.now() < deadline) {
    const { data } = await sb
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (data && statuses.includes(data.status)) {
      return data;
    }

    await new Promise((r) => setTimeout(r, poll));
  }

  throw new Error(`Task ${taskId} did not reach status [${statuses.join(",")}] within ${timeout}ms`);
}

/**
 * Get usage rows for an agent since a given timestamp.
 */
export async function getUsageSince(
  agentId: string,
  since: string
): Promise<UsageRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("agent_usage")
    .select("*")
    .eq("agent_id", agentId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true });

  if (error) throw new Error(`Usage query failed: ${error.message}`);
  return (data ?? []) as UsageRow[];
}

/**
 * Get comments on an entity (typically a task).
 */
export async function getComments(
  entityType: string,
  entityId: string
): Promise<Array<{ body: string; actor_type: string; actor_agent_id: string | null; created_at: string }>> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("comments")
    .select("body, actor_type, actor_agent_id, created_at")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Comments query failed: ${error.message}`);
  return data ?? [];
}

/**
 * Get the budget state for an agent.
 */
export async function getAgentBudget(agentId: string): Promise<Record<string, unknown> | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("agent_budgets")
    .select("*")
    .eq("agent_id", agentId)
    .single();

  if (error && error.code !== "PGRST116") throw new Error(`Budget query failed: ${error.message}`);
  return data;
}

/**
 * Create a task directly in DB and assign it to an agent (triggers inbox item creation).
 * Returns the task row.
 */
export async function createAndAssignTask(
  title: string,
  agentId: string,
  opts?: { description?: string; priority?: string }
): Promise<Record<string, unknown>> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from("tasks")
    .insert({
      title,
      description: opts?.description ?? "",
      priority: opts?.priority ?? "medium",
      status: "todo",
      assignee_agent_id: agentId,
    })
    .select()
    .single();

  if (error) throw new Error(`Create task failed: ${error.message}`);
  return data;
}

/**
 * Look up an agent by name or slug.
 */
export async function findAgent(nameOrSlug: string): Promise<Record<string, unknown> | null> {
  const sb = getServiceClient();
  const { data } = await sb
    .from("agents")
    .select("*")
    .or(`name.eq.${nameOrSlug},slug.eq.${nameOrSlug}`)
    .limit(1);

  return data?.[0] ?? null;
}
