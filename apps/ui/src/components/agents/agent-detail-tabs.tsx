"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Pause,
  Play,
  Trash2,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Terminal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import type { Agent, AgentMeta } from "@/lib/agents/types";
import { AGENT_STATUSES, DOMAIN_LABELS } from "@/lib/agents/types";
import { BOOT_TAG_ALL } from "@/lib/documents/boot-tags";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DetailHeader } from "@/components/shared/detail-header";
import {
  DetailSidebar,
  DetailSidebarMobile,
  DetailSidebarSection,
  DetailSidebarPropertyGrid,
  DetailSidebarProperty,
} from "@/components/shared/detail-sidebar";
import { InboxSection } from "@/components/automations/inbox-section";
import { AgentProvisioning } from "@/components/agents/agent-provisioning";
import { AgentFileBrowser } from "./agent-file-browser";
import { TriggersSection } from "./triggers-section";
import { OpenDesktopModal } from "@/components/gateways/open-desktop-modal";
import { getGatewayDesktopUrlAction } from "@/app/dashboard/settings/gateways/actions";
import { AgentModelSection } from "@/components/agents/agent-model-section";
import { AgentUsageRail } from "./agent-usage-rail";
import { AgentUsageTab } from "./agent-usage-tab";
import { updateAgent, toggleAgentPauseAction } from "@/app/dashboard/agents/actions";

const agentStatusDotHex: Record<string, string> = {
  ready: "var(--status-success)",
  error: "var(--status-error)",
  paused: "var(--status-warning)",
  provisioning: "var(--status-warning)",
  hibernating: "var(--status-neutral)",
};

interface BootDocument {
  id: string;
  title: string;
  icon: string | null;
  tags: string[];
}

interface AgentDetailTabsProps {
  agent: Agent;
  allAgents?: Agent[];
  bootDocuments?: BootDocument[];
  onAgentUpdated?: () => void;
}

export function AgentDetailTabs({
  agent,
  allAgents = [],
  bootDocuments = [],
  onAgentUpdated,
}: AgentDetailTabsProps) {
  const statusLabel =
    AGENT_STATUSES.find((s) => s.value === agent.status)?.label ?? agent.status;
  const statusColor = agentStatusDotHex[agent.status] ?? "var(--status-neutral)";

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
        identityTitle={agent.name}
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
        secondaryActions={
          <DetailSidebarMobile title={`${agent.name} details`}>
            <AgentRailContent
              agent={agent}
              allAgents={allAgents}
              bootDocuments={bootDocuments}
              statusLabel={statusLabel}
              statusColor={statusColor}
              onOpenDesktop={openDesktop}
              onAgentUpdated={onAgentUpdated}
            />
          </DetailSidebarMobile>
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
                onSelect={(e) => {
                  e.preventDefault();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border/60 px-5">
              <TabsList variant="line" className="h-9">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="operations">Operations</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl space-y-6 px-5 py-5">
                {agent.description && (
                  <p className="text-sm text-muted-foreground">
                    {agent.description}
                  </p>
                )}
                <DirectReportsSection agent={agent} allAgents={allAgents} />
                <ContextDocsSection agent={agent} bootDocuments={bootDocuments} />
                <div className="border-t border-border/50 pt-6">
                  <TriggersSection agent={agent} onAgentUpdated={onAgentUpdated} />
                </div>
                <div className="border-t border-border/50 pt-6">
                  <InboxSection agentId={agent.id} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="usage" className="min-h-0 flex-1 overflow-auto">
              <AgentUsageTab agentId={agent.id} />
            </TabsContent>

            <TabsContent value="files" className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-5xl px-5 py-5">
                <AgentFileBrowser slug={agent.slug} />
              </div>
            </TabsContent>

            <TabsContent
              value="operations"
              className="min-h-0 flex-1 overflow-auto"
            >
              <div className="mx-auto max-w-3xl px-5 py-5">
                <AgentProvisioning agent={agent} />
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <DetailSidebar>
          <AgentRailContent
            agent={agent}
            allAgents={allAgents}
            bootDocuments={bootDocuments}
            statusLabel={statusLabel}
            statusColor={statusColor}
            onOpenDesktop={openDesktop}
            onAgentUpdated={onAgentUpdated}
          />
        </DetailSidebar>
      </div>

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
    </div>
  );
}

// ─── Right rail content (shared by desktop + mobile) ─────────────────

function AgentRailContent({
  agent,
  allAgents,
  bootDocuments,
  statusLabel,
  statusColor,
  onOpenDesktop,
  onAgentUpdated,
}: {
  agent: Agent;
  allAgents: Agent[];
  bootDocuments: BootDocument[];
  statusLabel: string;
  statusColor: string;
  onOpenDesktop: () => void;
  onAgentUpdated?: () => void;
}) {
  const lastSeen = agent.last_seen_at
    ? formatDistanceToNow(new Date(agent.last_seen_at), { addSuffix: true })
    : "Never";

  const manager = useMemo(
    () => allAgents.find((a) => a.id === agent.reports_to_id) ?? null,
    [allAgents, agent.reports_to_id],
  );
  const directReports = useMemo(
    () => allAgents.filter((a) => a.reports_to_id === agent.id),
    [allAgents, agent.id],
  );

  const [managerPickerOpen, setManagerPickerOpen] = useState(false);
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
        setManagerPickerOpen(false);
      }
    },
    [agent.id, onAgentUpdated],
  );

  const managerCandidates = useMemo(
    () => allAgents.filter((a) => a.id !== agent.id),
    [allAgents, agent.id],
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

      <DetailSidebarSection title="Properties">
        <DetailSidebarPropertyGrid>
          <DetailSidebarProperty label="Slug">
            <span className="font-mono text-foreground/80">@{agent.slug}</span>
          </DetailSidebarProperty>
          {allAgents.length > 1 && (
            <DetailSidebarProperty label="Manager">
              <Popover
                open={managerPickerOpen}
                onOpenChange={setManagerPickerOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={savingManager}
                    className="text-left text-foreground/80 hover:text-foreground transition-colors"
                  >
                    {manager ? (
                      <span>
                        {(manager.meta as AgentMeta)?.emoji
                          ? `${(manager.meta as AgentMeta).emoji} `
                          : ""}
                        {manager.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">
                        Operator (you)
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="start">
                  <button
                    type="button"
                    onClick={() => handleManagerChange(null)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-accent text-left",
                      !agent.reports_to_id && "bg-accent/60",
                    )}
                  >
                    <span className="text-muted-foreground/60">
                      Operator (you)
                    </span>
                  </button>
                  {managerCandidates.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => handleManagerChange(a.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-accent text-left",
                        agent.reports_to_id === a.id && "bg-accent/60",
                      )}
                    >
                      {(a.meta as AgentMeta)?.emoji && (
                        <span className="text-[13px]">
                          {(a.meta as AgentMeta).emoji}
                        </span>
                      )}
                      <span className="truncate">{a.name}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </DetailSidebarProperty>
          )}
          {directReports.length > 0 && (
            <DetailSidebarProperty label="Reports">
              <span className="text-foreground/80">
                {directReports.length} direct{" "}
                {directReports.length === 1 ? "report" : "reports"}
              </span>
            </DetailSidebarProperty>
          )}
          {agent.domains.length > 0 && (
            <DetailSidebarProperty label="Domains">
              <span className="flex flex-wrap gap-1">
                {agent.domains.map((d) => (
                  <span
                    key={d}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {DOMAIN_LABELS[d] || d}
                  </span>
                ))}
              </span>
            </DetailSidebarProperty>
          )}
          {agent.capabilities && agent.capabilities.length > 0 && (
            <DetailSidebarProperty label="Capabilities">
              <span className="flex flex-wrap gap-1">
                {agent.capabilities.map((c) => (
                  <span
                    key={c}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </span>
            </DetailSidebarProperty>
          )}
          <DetailSidebarProperty label="Created">
            <span className="text-muted-foreground">
              {format(new Date(agent.created_at), "MMM d, yyyy")}
            </span>
          </DetailSidebarProperty>
        </DetailSidebarPropertyGrid>
      </DetailSidebarSection>

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

          <DetailSidebarSection title="Model">
            <AgentModelSection
              agentId={agent.id}
              gatewayId={agent.gateway_id}
              currentModel={agent.model}
              currentThinking={agent.thinking}
            />
          </DetailSidebarSection>
        </>
      )}

      {bootDocuments.length > 0 && (
        <DetailSidebarSection title={`Context (${bootDocuments.length})`}>
          <div className="space-y-0.5">
            {bootDocuments.slice(0, 5).map((doc) => (
              <Link
                key={doc.id}
                href={`/dashboard/documents/${doc.id}`}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[12px] text-foreground hover:bg-accent/40"
              >
                <span className="text-[13px]">{doc.icon || "📄"}</span>
                <span className="truncate">{doc.title}</span>
                <Badge
                  variant="secondary"
                  className="ml-auto h-4 shrink-0 border border-purple-500/20 bg-purple-500/15 px-1.5 text-[10px] text-purple-400"
                >
                  {doc.tags.includes(BOOT_TAG_ALL) ? "all" : agent.slug}
                </Badge>
              </Link>
            ))}
            {bootDocuments.length > 5 && (
              <div className="px-1.5 pt-1 text-[11px] text-muted-foreground">
                +{bootDocuments.length - 5} more
              </div>
            )}
          </div>
        </DetailSidebarSection>
      )}

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

function ContextDocsSection({
  agent,
  bootDocuments,
}: {
  agent: Agent;
  bootDocuments: BootDocument[];
}) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/30"
            >
              <span className="shrink-0 text-sm">{doc.icon || "📄"}</span>
              <span className="flex-1 truncate text-foreground">
                {doc.title}
              </span>
              <Badge
                variant="secondary"
                className="h-4 shrink-0 border border-purple-500/20 bg-purple-500/15 px-1.5 text-[10px] text-purple-400"
              >
                {doc.tags.includes(BOOT_TAG_ALL) ? "all agents" : agent.slug}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
