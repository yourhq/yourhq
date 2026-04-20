"use client";

import type { Agent } from "@/lib/agents/types";
import { AGENT_STATUSES, DOMAIN_LABELS } from "@/lib/agents/types";
import { BOOT_TAG_ALL } from "@/lib/documents/boot-tags";
import { useAuditLog } from "@/hooks/use-audit-log";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/ui/status-dot";
import { InboxSection } from "@/components/automations/inbox-section";
import { AgentProvisioning } from "@/components/agents/agent-provisioning";
import { format } from "date-fns";
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

interface AgentDetailProps {
  agent: Agent;
  bootDocuments?: BootDocument[];
}

export function AgentDetail({ agent, bootDocuments = [] }: AgentDetailProps) {
  const audit = useAuditLog();
  const agentEntries = audit.entries.filter((e) => e.actor_agent_id === agent.id);
  const statusLabel = AGENT_STATUSES.find((s) => s.value === agent.status)?.label ?? agent.status;

  return (
    <div className="space-y-4">
      {agent.description && (
        <p className="text-sm text-muted-foreground">{agent.description}</p>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-xs max-w-sm">
        <span className="text-muted-foreground py-0.5">Status</span>
        <span className="py-0.5">
          <StatusDot color={agentStatusDotHex[agent.status] ?? "#6b7280"} label={statusLabel} />
        </span>

        {agent.domains.length > 0 && (
          <>
            <span className="text-muted-foreground py-0.5">Domains</span>
            <div className="flex flex-wrap gap-1 py-0.5">
              {agent.domains.map((d) => (
                <span key={d} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  {DOMAIN_LABELS[d] || d}
                </span>
              ))}
            </div>
          </>
        )}

        {agent.capabilities && agent.capabilities.length > 0 && (
          <>
            <span className="text-muted-foreground py-0.5">Capabilities</span>
            <div className="flex flex-wrap gap-1 py-0.5">
              {agent.capabilities.map((c) => (
                <span key={c} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  {c}
                </span>
              ))}
            </div>
          </>
        )}

        <span className="text-muted-foreground py-0.5">Registered</span>
        <span className="py-0.5 text-muted-foreground">{format(new Date(agent.created_at), "MMM d, yyyy")}</span>

        {agent.last_seen_at && (
          <>
            <span className="text-muted-foreground py-0.5">Last Seen</span>
            <span className="py-0.5 text-muted-foreground">{format(new Date(agent.last_seen_at), "MMM d, h:mm a")}</span>
          </>
        )}
      </div>

      {/* Provisioning & Operations */}
      <div className="border-t border-border/50 pt-4">
        <AgentProvisioning agent={agent} />
      </div>

      {/* Boot Documents */}
      <div className="border-t border-border/50 pt-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Context Documents
        </h2>
        {bootDocuments.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No context documents configured for this agent.
          </p>
        ) : (
          <div className="space-y-1">
            {bootDocuments.map((doc) => (
              <Link
                key={doc.id}
                href={`/dashboard/documents/${doc.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/30 transition-colors"
              >
                <span className="text-sm shrink-0">{doc.icon || "📄"}</span>
                <span className="flex-1 truncate text-foreground">{doc.title}</span>
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] shrink-0 bg-purple-500/15 text-purple-400 border border-purple-500/20"
                >
                  {doc.tags.includes(BOOT_TAG_ALL) ? "all agents" : agent.slug}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Inbox */}
      <div className="border-t border-border/50 pt-4">
        <InboxSection agentId={agent.id} />
      </div>

      <div className="border-t border-border/50 pt-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Activity</h2>
        <ActivityFeed
          entries={agentEntries}
          loading={audit.loading}
          hasMore={false}
          onLoadMore={() => {}}
        />
      </div>
    </div>
  );
}
