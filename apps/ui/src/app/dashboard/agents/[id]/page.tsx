import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Agent } from "@/lib/agents/types";
import { AgentDetailTabs } from "@/components/agents/agent-detail-tabs";

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (!agent) notFound();

  // Fetch documents that boot for this agent (boot:all or boot:{slug})
  const { data: bootDocs } = await supabase
    .from("documents")
    .select("id, title, icon, tags")
    .or(`tags.cs.{boot:all},tags.cs.{boot:${agent.slug}}`)
    .order("title", { ascending: true });

  return (
    <AgentDetailTabs
      agent={agent as Agent}
      bootDocuments={(bootDocs ?? []) as { id: string; title: string; icon: string | null; tags: string[] }[]}
    />
  );
}
