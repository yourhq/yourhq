import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Agent } from "@/lib/agents/types";
import { AgentDetailClient } from "./client";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: agent }, { data: allAgents }] =
    await Promise.all([
      supabase.from("agents").select("*").eq("id", id).single(),
      supabase.from("agents").select("*").order("name", { ascending: true }),
    ]);

  if (!agent) notFound();

  const [{ data: workspaceItems }, { data: agentJunction }] = await Promise.all([
    supabase
      .from("knowledge_items")
      .select("id, title, kind, scope")
      .eq("scope", "workspace")
      .is("archived_at", null)
      .order("title", { ascending: true }),
    supabase
      .from("knowledge_item_agents")
      .select("knowledge_item_id, knowledge_items:knowledge_item_id(id, title, kind, scope)")
      .eq("agent_id", id),
  ]);

  type KnowledgeRef = { id: string; title: string; kind: string; scope: string };
  const agentItems = (agentJunction ?? [])
    .map((j: Record<string, unknown>) => j.knowledge_items as KnowledgeRef | null)
    .filter((k): k is KnowledgeRef => k != null);

  const seen = new Set<string>();
  const contextItems: KnowledgeRef[] = [];
  for (const item of [...(workspaceItems ?? []) as KnowledgeRef[], ...agentItems]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      contextItems.push(item);
    }
  }

  return (
    <AgentDetailClient
      agent={agent as Agent}
      allAgents={(allAgents ?? []) as Agent[]}
      contextKnowledge={contextItems}
    />
  );
}
