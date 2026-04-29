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

  const [{ data: agent }, { data: allAgents }, { data: bootDocs }] =
    await Promise.all([
      supabase.from("agents").select("*").eq("id", id).single(),
      supabase.from("agents").select("*").order("name", { ascending: true }),
      supabase
        .from("documents")
        .select("id, title, icon, tags")
        .order("title", { ascending: true }),
    ]);

  if (!agent) notFound();

  const agentSlug = (agent as Agent).slug;
  const filteredDocs = (bootDocs ?? []).filter(
    (d: { tags: string[] }) =>
      d.tags?.includes("boot:all") || d.tags?.includes(`boot:${agentSlug}`),
  );

  return (
    <AgentDetailClient
      agent={agent as Agent}
      allAgents={(allAgents ?? []) as Agent[]}
      bootDocuments={
        filteredDocs as {
          id: string;
          title: string;
          icon: string | null;
          tags: string[];
        }[]
      }
    />
  );
}
