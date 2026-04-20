"use client";

import type { Agent } from "@/lib/agents/types";
import { AgentDetail } from "./agent-detail";
import { AgentFileBrowser } from "./agent-file-browser";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Bot } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { AGENT_STATUSES } from "@/lib/agents/types";
import Link from "next/link";

const agentStatusDotHex: Record<string, string> = {
  online: "#22c55e",
  offline: "#6b7280",
  error: "#ef4444",
  paused: "#eab308",
};

interface BootDocument {
  id: string;
  title: string;
  icon: string | null;
  tags: string[];
}

interface AgentDetailTabsProps {
  agent: Agent;
  bootDocuments?: BootDocument[];
}

export function AgentDetailTabs({
  agent,
  bootDocuments = [],
}: AgentDetailTabsProps) {
  const statusLabel =
    AGENT_STATUSES.find((s) => s.value === agent.status)?.label ?? agent.status;

  return (
    <div className="h-full overflow-auto px-4 py-5 sm:px-6 md:px-8">
      {/* Agent header */}
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/agents"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Agents
        </Link>

        <div className="flex items-start gap-3 mt-4">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            {agent.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agent.avatar_url}
                alt=""
                className="h-10 w-10 rounded-full"
              />
            ) : (
              <Bot className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{agent.name}</h1>
              <StatusDot
                color={agentStatusDotHex[agent.status] ?? "#6b7280"}
                size="sm"
                pulse={agent.status === "online"}
                label={statusLabel}
              />
            </div>
            <p className="text-xs text-muted-foreground">@{agent.slug}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="mt-6">
        <div className="mx-auto max-w-3xl">
          <TabsList variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="mx-auto max-w-3xl pt-4">
            <AgentDetail agent={agent} bootDocuments={bootDocuments} />
          </div>
        </TabsContent>

        <TabsContent value="files">
          <div className="mx-auto mt-4 max-w-5xl">
            <AgentFileBrowser slug={agent.slug} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
