"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/lib/agents/types";
import { useRealtime } from "@/hooks/use-realtime";
import { AgentDetailTabs } from "@/components/agents/agent-detail-tabs";

interface Props {
  agent: Agent;
  allAgents: Agent[];
  contextKnowledge: {
    id: string;
    title: string;
    kind: string;
    scope: string;
  }[];
}

export function AgentDetailClient({
  agent,
  allAgents,
  contextKnowledge,
}: Props) {
  const router = useRouter();
  const [key, setKey] = useState(0);

  const handleUpdated = useCallback(() => {
    router.refresh();
    setKey((k) => k + 1);
  }, [router]);

  useRealtime({
    table: "agents",
    filter: `id=eq.${agent.id}`,
    event: "UPDATE",
    onPayload: () => handleUpdated(),
  });

  useRealtime({
    table: "knowledge_items",
    onPayload: () => router.refresh(),
  });

  useRealtime({
    table: "knowledge_item_agents",
    filter: `agent_id=eq.${agent.id}`,
    onPayload: () => router.refresh(),
  });

  return (
    <AgentDetailTabs
      key={key}
      agent={agent}
      allAgents={allAgents}
      contextKnowledge={contextKnowledge}
      onAgentUpdated={handleUpdated}
    />
  );
}
