"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent } from "@/lib/agents/types";
import { AgentDetailTabs } from "@/components/agents/agent-detail-tabs";

interface Props {
  agent: Agent;
  allAgents: Agent[];
  bootDocuments: {
    id: string;
    title: string;
    icon: string | null;
    tags: string[];
  }[];
}

export function AgentDetailClient({
  agent,
  allAgents,
  bootDocuments,
}: Props) {
  const router = useRouter();
  const [key, setKey] = useState(0);

  const handleUpdated = useCallback(() => {
    router.refresh();
    setKey((k) => k + 1);
  }, [router]);

  return (
    <AgentDetailTabs
      key={key}
      agent={agent}
      allAgents={allAgents}
      bootDocuments={bootDocuments}
      onAgentUpdated={handleUpdated}
    />
  );
}
