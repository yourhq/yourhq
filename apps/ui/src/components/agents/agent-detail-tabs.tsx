"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  Pause,
  Play,
  Trash2,
  ExternalLink,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Terminal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import type { Agent, AgentMeta } from "@/lib/agents/types";
import { AGENT_STATUSES } from "@/lib/agents/types";
import { KNOWLEDGE_KIND_COLORS } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DetailHeader } from "@/components/shared/detail-header";
import {
  DetailSidebar,
  DetailSidebarInline,
  DetailSidebarSection,
  DetailSidebarPropertyGrid,
  DetailSidebarProperty,
} from "@/components/shared/detail-sidebar";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InboxSection } from "@/components/inbox/inbox-section";
import { AgentProvisioning } from "@/components/agents/agent-provisioning";
import { AgentChannelCard } from "@/components/agents/agent-channel-card";
import { AgentFileBrowser } from "./agent-file-browser";
import { AgentBrowserTab } from "./agent-browser-tab";
import { RoutinesSection } from "@/components/routines/routines-section";
import { OpenDesktopModal } from "@/components/gateways/open-desktop-modal";
import { getGatewayDesktopUrlAction } from "@/app/dashboard/settings/gateways/actions";
import { AgentModelSection } from "@/components/agents/agent-model-section";
import { AgentOrgSlice } from "@/components/agents/agent-org-slice";
import { AgentUsageRail } from "./agent-usage-rail";
import { AgentSecretsTab } from "./agent-secrets-tab";
import { AgentKnowledgeSection } from "./agent-knowledge-section";
import { InlineEdit } from "@/components/ui/inline-edit";
import { updateAgent, toggleAgentPauseAction, deleteAgentAction } from "@/app/dashboard/agents/actions";

const agentStatusDotHex: Record<string, string> = {
  ready: "var(--status-success)",
  error: "var(--status-error)",
  paused: "var(--status-warning)",
  provisioning: "var(--status-warning)",
  hibernating: "var(--status-neutral)",
};

interface ContextKnowledgeItem {
  id: string;
  title: string;
  kind: string;
  scope: string;
}

interface AgentDetailTabsProps {
  agent: Agent;
  allAgents?: Agent[];
  contextKnowledge?: ContextKnowledgeItem[];
  onAgentUpdated?: () => void;
}

export function AgentDetailTabs({
  agent,
  allAgents = [],
  contextKnowledge = [],
  onAgentUpdated,
}: AgentDetailTabsProps) {
  const router = useRouter();
  const statusLabel =
    AGENT_STATUSES.find((s) => s.value === agent.status)?.label ?? agent.status;
  const statusColor = agentStatusDotHex[agent.status] ?? "var(--status-neutral)";

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [desktop, setDesktop] = useState<{
    open: boolean;
    novncUrl: string | null;
    gatewayLabel: string | null;
    loading: boolean;
  }>({ open: false, novncUrl: null, gatewayLabel: null, loading: false });

  const openDesktop = async () => {
    if (!agent.gateway_id) {
      toast.error("This agent has no gateway assigned.");
      return;
    }
    setDesktop({
      open: true,
      novncUrl: null,
      gatewayLabel: null,
      loading: true,
    });
    const r = await getGatewayDesktopUrlAction(agent.gateway_id);
    if (!r.ok || !r.data) {
      toast.error(r.error ?? "Couldn't fetch desktop URL");
      setDesktop({
        open: false,
        novncUrl: null,
        gatewayLabel: null,
        loading: false,
      });
      return;
    }
    setDesktop({
      open: true,
      novncUrl: r.data.novncUrl,
      gatewayLabel: r.data.gatewayLabel,
      loading: false,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <DetailHeader
        back={{ href: "/dashboard/agents", label: "Agents" }}
        identityIcon={<AgentAvatar agent={agent} />}
        identityTitle={
          <InlineEdit
            value={agent.name}
            onSave={async (v) => {
              try {
                await updateAgent({ agentId: agent.id, name: v });
                onAgentUpdated?.();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to rename");
              }
            }}
            className="text-sm font-semibold -ml-1.5"
            inputClassName="text-sm font-semibold"
          />
        }
        identityMeta={
          <>
            <StatusDot
              color={statusColor}
              size="sm"
              pulse={agent.status === "ready"}
            />
            <span>{statusLabel}</span>
            <span>·</span>
            <span className="font-mono">@{agent.slug}</span>
          </>
        }
        identityDescription={
          <InlineEdit
            value={agent.description ?? ""}
            type="textarea"
            placeholder="Add a description — what does this agent do?"
            onSave={async (v) => {
              try {
                await updateAgent({ agentId: agent.id, description: v || null });
                onAgentUpdated?.();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to update");
              }
            }}
            className="text-[12px] text-muted-foreground -ml-1.5"
            inputClassName="text-[12px] text-muted-foreground"
          />
        }
        overflow={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Agent actions">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border/60 px-5">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="secrets">Secrets</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
            {agent.gateway_id && (
              <TabsTrigger value="browser">Browser</TabsTrigger>
            )}
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-h-full">
            <main className="min-w-0 flex-1">
              <TabsContent value="overview" className="mt-0">
                <div className="mx-auto max-w-3xl space-y-6 px-5 py-5">
                  <AgentChannelCard agent={agent} onAgentUpdated={onAgentUpdated} />
                  <DirectReportsSection agent={agent} allAgents={allAgents} />
                  <AgentKnowledgeSection agentId={agent.id} agentSlug={agent.slug} />
                  <ContextKnowledgeSection agent={agent} contextKnowledge={contextKnowledge} />
                  <div className="border-t border-border/50 pt-6">
                    <RoutinesSection agent={agent} onAgentUpdated={onAgentUpdated} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="secrets" className="mt-0">
                <AgentSecretsTab
                  agentId={agent.id}
                  agentName={agent.name}
                  gatewayId={agent.gateway_id}
                />
              </TabsContent>

              <TabsContent value="files" className="mt-0">
                <div className="mx-auto max-w-5xl px-5 py-5">
                  <AgentFileBrowser slug={agent.slug} />
                </div>
              </TabsContent>

              {agent.gateway_id && (
                <TabsContent value="browser" className="mt-0">
                  <AgentBrowserTab slug={agent.slug} />
                </TabsContent>
              )}

              <TabsContent value="activity" className="mt-0">
                <div className="mx-auto max-w-3xl space-y-6 px-5 py-5">
                  <InboxSection agentId={agent.id} />
                  <div className="border-t border-border/50 pt-6">
                    <AgentProvisioning agent={agent} />
                  </div>
                </div>
              </TabsContent>

              <DetailSidebarInline>
                <AgentRailContent
                  agent={agent}
                  allAgents={allAgents}
                  contextKnowledge={contextKnowledge}
                  statusLabel={statusLabel}
                  statusColor={statusColor}
                  onOpenDesktop={openDesktop}
                  onAgentUpdated={onAgentUpdated}
                />
              </DetailSidebarInline>
            </main>

            <DetailSidebar>
              <AgentRailContent
                agent={agent}
                allAgents={allAgents}
                contextKnowledge={contextKnowledge}
                statusLabel={statusLabel}
                statusColor={statusColor}
                onOpenDesktop={openDesktop}
                onAgentUpdated={onAgentUpdated}
              />
            </DetailSidebar>
          </div>
        </div>
      </Tabs>

      <OpenDesktopModal
        open={desktop.open}
        onClose={() =>
          setDesktop({
            open: false,
            novncUrl: null,
            gatewayLabel: null,
            loading: false,
          })
        }
        novncUrl={desktop.loading ? null : desktop.novncUrl}
        title={`Desktop · ${agent.name}`}
        subtitle={
          desktop.gatewayLabel
            ? `running on ${desktop.gatewayLabel}`
            : desktop.loading
              ? "loading…"
              : undefined
        }
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${agent.name}?`}
        description="This permanently removes the agent from your workspace. Its git branch and conversation history will no longer be accessible from HQ."
        confirmLabel="Delete agent"
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await deleteAgentAction(agent.id);
            toast.success(`Deleted ${agent.name}`);
            router.push("/dashboard/agents");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete agent");
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

// ─── Right rail content (shared by desktop + mobile) ─────────────────

function AgentRailContent({
  agent,
  allAgents,
  contextKnowledge,
  statusLabel,
  statusColor,
  onOpenDesktop,
  onAgentUpdated,
}: {
  agent: Agent;
  allAgents: Agent[];
  contextKnowledge: ContextKnowledgeItem[];
  statusLabel: string;
  statusColor: string;
  onOpenDesktop: () => void;
  onAgentUpdated?: () => void;
}) {
  const lastSeen = agent.last_seen_at
    ? formatDistanceToNow(new Date(agent.last_seen_at), { addSuffix: true })
    : "Never";

  const [savingManager, setSavingManager] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);

  const handleTogglePause = useCallback(async () => {
    setTogglingPause(true);
    try {
      const r = await toggleAgentPauseAction(agent.id, agent.status);
      if (!r.ok) {
        toast.error(r.error ?? "Failed to update status");
        return;
      }
      toast.success(r.newStatus === "paused" ? "Agent paused" : "Agent resumed");
      onAgentUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setTogglingPause(false);
    }
  }, [agent.id, agent.status, onAgentUpdated]);

  const handleManagerChange = useCallback(
    async (newManagerId: string | null) => {
      setSavingManager(true);
      try {
        await updateAgent({ agentId: agent.id, reportsToId: newManagerId });
        onAgentUpdated?.();
        toast.success(newManagerId ? "Manager updated" : "Manager cleared");
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to update manager",
        );
      } finally {
        setSavingManager(false);
      }
    },
    [agent.id, onAgentUpdated],
  );

  return (
    <>
      <DetailSidebarSection title="Status">
        <div className="flex items-center gap-2 text-[12px]">
          <StatusDot
            color={statusColor}
            size="sm"
            pulse={agent.status === "ready"}
          />
          <span>{statusLabel}</span>
          <span className="text-muted-foreground/60">· {lastSeen}</span>
        </div>
      </DetailSidebarSection>

      <AgentUsageRail agentId={agent.id} />

      {allAgents.length > 1 && (
        <DetailSidebarSection title="Org">
          <AgentOrgSlice
            agent={agent}
            allAgents={allAgents}
            onChangeManager={handleManagerChange}
            disabled={savingManager}
          />
        </DetailSidebarSection>
      )}

      {agent.gateway_id && (
        <>
          <DetailSidebarSection title="Quick actions">
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 justify-start text-[12px]"
                onClick={onOpenDesktop}
                title="Open the gateway's container desktop"
              >
                <Terminal className="mr-1.5 h-3 w-3" />
                Open desktop
              </Button>
              {(agent.status === "ready" || agent.status === "paused") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 justify-start text-[12px]"
                  onClick={handleTogglePause}
                  disabled={togglingPause}
                >
                  {agent.status === "paused" ? (
                    <>
                      <Play className="mr-1.5 h-3 w-3" />
                      Resume agent
                    </>
                  ) : (
                    <>
                      <Pause className="mr-1.5 h-3 w-3" />
                      Pause agent
                    </>
                  )}
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">
              Shows the desktop of the machine this agent runs on.
            </p>
          </DetailSidebarSection>

          <DetailSidebarSection title="Model">
            <AgentModelSection
              agentId={agent.id}
              gatewayId={agent.gateway_id}
              currentModel={agent.model}
              currentThinking={agent.thinking}
              onModelChange={() => onAgentUpdated?.()}
            />
          </DetailSidebarSection>
        </>
      )}

      {contextKnowledge.length > 0 && (
        <DetailSidebarSection title={`Knowledge (${contextKnowledge.length})`}>
          <div className="space-y-0.5">
            {contextKnowledge.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/knowledge/${item.id}`}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[12px] text-foreground hover:bg-accent/40"
              >
                <span className="truncate">{item.title}</span>
                <Badge
                  variant="secondary"
                  className={cn("ml-auto h-4 shrink-0 px-1.5 text-[10px]", KNOWLEDGE_KIND_COLORS[item.kind as keyof typeof KNOWLEDGE_KIND_COLORS] ?? "bg-muted text-muted-foreground")}
                >
                  {item.scope === "workspace" ? "all" : agent.slug}
                </Badge>
              </Link>
            ))}
            {contextKnowledge.length > 5 && (
              <div className="px-1.5 pt-1 text-[11px] text-muted-foreground">
                +{contextKnowledge.length - 5} more
              </div>
            )}
          </div>
        </DetailSidebarSection>
      )}

      {agent.gateway_id && (
        <DetailSidebarSection title="Gateway">
          <Link
            href={`/dashboard/settings/gateways/${agent.gateway_id}`}
            className="flex items-center justify-between gap-2 text-[12px] text-foreground hover:underline"
          >
            <span className="truncate">View gateway</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Link>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            Restart or inspect commands for the host machine.
          </p>
        </DetailSidebarSection>
      )}

      <DetailSidebarSection title="Properties">
        <DetailSidebarPropertyGrid>
          <DetailSidebarProperty label="Slug">
            <span className="font-mono text-foreground/80">@{agent.slug}</span>
          </DetailSidebarProperty>
          <DetailSidebarProperty label="Created">
            <span className="text-muted-foreground">
              {format(new Date(agent.created_at), "MMM d, yyyy")}
            </span>
          </DetailSidebarProperty>
        </DetailSidebarPropertyGrid>
      </DetailSidebarSection>

      <DetailSidebarSection title="History">
        <Link
          href="/dashboard/activity"
          className="inline-flex items-center gap-1 text-[12px] text-foreground hover:underline"
        >
          <FileText className="h-3 w-3 text-muted-foreground" />
          See full activity log
        </Link>
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Everything this agent has done — woken, replied, edited, etc.
        </p>
      </DetailSidebarSection>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function AgentAvatar({ agent }: { agent: Agent }) {
  const meta = (agent.meta ?? {}) as AgentMeta;
  const emoji = meta.emoji as string | undefined;
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-base">
      {agent.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agent.avatar_url}
          alt=""
          className="h-8 w-8 rounded object-cover"
        />
      ) : emoji ? (
        <span>{emoji}</span>
      ) : (
        <Bot className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}

function DirectReportsSection({
  agent,
  allAgents,
}: {
  agent: Agent;
  allAgents: Agent[];
}) {
  const reports = useMemo(
    () => allAgents.filter((a) => a.reports_to_id === agent.id),
    [allAgents, agent.id],
  );

  const hasManager = !!agent.reports_to_id;
  const isAlone = !hasManager && reports.length === 0;

  if (isAlone) {
    return (
      <div className="rounded-lg border border-border/50 bg-accent/20 p-4">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{agent.name}</span> works independently.
          As your workload grows, you can build a team.
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            href="/dashboard/agents?create=true"
            className="text-[12px] font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            + Add a specialist
          </Link>
        </div>
      </div>
    );
  }

  if (reports.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="mr-1.5 inline h-3 w-3" />
        Direct Reports ({reports.length})
      </h2>
      <div className="space-y-0.5">
        {reports.map((r) => {
          const meta = (r.meta ?? {}) as AgentMeta;
          return (
            <Link
              key={r.id}
              href={`/dashboard/agents/${r.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/30"
            >
              <span className="shrink-0 text-sm">
                {meta.emoji || (
                  <Bot className="inline h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
              <span className="flex-1 truncate text-foreground">{r.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
                @{r.slug}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ContextKnowledgeSection({
  agent,
  contextKnowledge,
}: {
  agent: Agent;
  contextKnowledge: ContextKnowledgeItem[];
}) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <FolderOpen className="mr-1.5 inline h-3 w-3" />
        Knowledge
      </h2>
      {contextKnowledge.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No knowledge items configured for this agent.
        </p>
      ) : (
        <div className="space-y-1">
          {contextKnowledge.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/knowledge/${item.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/30"
            >
              <span className="flex-1 truncate text-foreground">
                {item.title}
              </span>
              <Badge
                variant="secondary"
                className={cn("h-4 shrink-0 px-1.5 text-[10px]", KNOWLEDGE_KIND_COLORS[item.kind as keyof typeof KNOWLEDGE_KIND_COLORS] ?? "bg-muted text-muted-foreground")}
              >
                {item.scope === "workspace" ? "all agents" : agent.slug}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
