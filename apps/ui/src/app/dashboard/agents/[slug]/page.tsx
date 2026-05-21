import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import type { Agent } from "@/lib/agents/types";
import { AgentDetailClient } from "./client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  let agent: Agent | null = null;

  if (UUID_RE.test(slug)) {
    const { data } = await supabase
      .from("agents")
      .select("*")
      .eq("id", slug)
      .single();
    if (data) redirect(`/dashboard/agents/${data.slug}`);
    notFound();
  }

  const { data } = await supabase
    .from("agents")
    .select("*")
    .eq("slug", slug)
    .single();
  agent = data as Agent | null;

  if (!agent) notFound();

  const [{ data: allAgents }, { data: workspaceItems }, { data: agentJunction }] =
    await Promise.all([
      supabase.from("agents").select("*").order("name", { ascending: true }),
      supabase
        .from("knowledge_items")
        .select("id, title, kind, scope")
        .eq("scope", "workspace")
        .is("archived_at", null)
        .order("title", { ascending: true }),
      supabase
        .from("knowledge_item_agents")
        .select("knowledge_item_id, knowledge_items:knowledge_item_id(id, title, kind, scope)")
        .eq("agent_id", agent.id),
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
      agent={agent}
      allAgents={(allAgents ?? []) as Agent[]}
      contextKnowledge={contextItems}
    />
  );
}
