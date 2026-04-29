"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ChevronRight,
  Loader2,
  Power,
  RefreshCw,
  Server,
  Download,
  Inbox,
  ScrollText,
  Bot,
  User,
  Cpu,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useAgentCommands } from "@/hooks/use-agent-commands";
import { useInboxItems } from "@/hooks/use-inbox-items";
import { useAuditLog } from "@/hooks/use-audit-log";
import { enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import type { AgentCommand, CommandAction, CommandStatus } from "@/lib/agents/types";
import { COMMAND_ACTION_LABELS, COMMAND_STATUS_COLORS } from "@/lib/agents/types";
import type { InboxItem, InboxItemStatus } from "@/lib/automations/types";
import { INBOX_STATUS_COLORS } from "@/lib/automations/types";
import type { AuditLogEntry, AuditModule } from "@/lib/audit/types";
import { MODULE_LABELS, MODULE_COLORS, AUDIT_ACTIONS } from "@/lib/audit/types";
import type { Gateway } from "@/lib/gateways/types";
import { listGatewaysAction } from "@/app/dashboard/settings/gateways/actions";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Confirm dialog ───────────────────────────────────────────

function ConfirmActionDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  actionLabel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm" onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction size="sm" onClick={onConfirm}>{actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Command row ──────────────────────────────────────────────

function SystemCommandRow({ command }: { command: AgentCommand }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = command.stdout || command.stderr || command.error_message;

  return (
    <div className={cn("border-b border-border/50 last:border-0", command.status === "failed" && "bg-red-500/5")}>
      <button
        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        {hasOutput ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <StatusDot color={COMMAND_STATUS_COLORS[command.status]} size="sm" />
        <span className="text-xs font-medium text-foreground shrink-0">
          {COMMAND_ACTION_LABELS[command.action]}
        </span>
        {command.agent_slug && (
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
            {command.agent_slug}
          </span>
        )}
        <span className="text-xs text-muted-foreground truncate flex-1">
          {command.status === "running" && "Running…"}
          {command.status === "leased" && "Claimed…"}
          {command.status === "pending" && "Queued"}
          {command.status === "done" && (command.exit_code !== null ? `exit ${command.exit_code}` : "Done")}
          {command.status === "failed" && (command.error_message || "Failed")}
        </span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {formatDistanceToNow(new Date(command.created_at), { addSuffix: true })}
        </span>
      </button>
      {expanded && hasOutput && (
        <div className="px-4 pb-3 pt-1 space-y-2">
          {command.stdout && (
            <div>
              <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">stdout</span>
              <pre className="text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2.5 overflow-x-auto max-h-48 whitespace-pre-wrap break-all mt-0.5">
                {command.stdout}
              </pre>
            </div>
          )}
          {command.stderr && (
            <div>
              <span className="text-[10px] text-red-400/80 uppercase tracking-wider">stderr</span>
              <pre className="text-[10px] text-red-300/80 bg-red-500/10 rounded-md p-2.5 overflow-x-auto max-h-48 whitespace-pre-wrap break-all mt-0.5">
                {command.stderr}
              </pre>
            </div>
          )}
          {command.error_message && !command.stderr && (
            <div>
              <span className="text-[10px] text-red-400/80 uppercase tracking-wider">error</span>
              <pre className="text-[10px] text-red-300/80 bg-red-500/10 rounded-md p-2.5 overflow-x-auto max-h-32 whitespace-pre-wrap break-all mt-0.5">
                {command.error_message}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inbox row ───────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  task_assignment: "Task assigned",
  task_reassignment: "Task reassigned",
  task_comment_mention: "Mentioned in comment",
  contact_created: "Contact created",
  contact_status_changed: "Contact status changed",
  contact_updated: "Contact updated",
};

function InboxRow({ item }: { item: InboxItem }) {
  return (
    <div className={cn("border-b border-border/50 last:border-0", item.status === "failed" && "bg-red-500/5", item.status === "dead_letter" && "bg-red-500/5")}>
      <div className="flex items-center gap-2.5 w-full px-3 py-2.5">
        <StatusDot color={INBOX_STATUS_COLORS[item.status]} size="sm" />
        <span className="text-xs font-medium text-foreground shrink-0">
          {EVENT_TYPE_LABELS[item.event_type] ?? item.event_type}
        </span>
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
          {item.agent?.name ?? item.agent_slug}
        </span>
        <span className="text-xs text-muted-foreground truncate flex-1">
          {item.summary ?? ""}
        </span>
        {item.attempt_count > 1 && (
          <span className="text-[10px] text-muted-foreground/50 shrink-0">
            ×{item.attempt_count}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

// ── Audit log row ───────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const moduleLabel = MODULE_LABELS[entry.module as AuditModule] ?? entry.module;
  const moduleColor = MODULE_COLORS[entry.module as AuditModule] ?? "bg-muted text-muted-foreground";
  const actionLabel = AUDIT_ACTIONS.find((a) => a.value === entry.action)?.label ?? entry.action;

  return (
    <div className="border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2.5 w-full px-3 py-2.5">
        {entry.actor_type === "agent" ? (
          <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : entry.actor_type === "system" ? (
          <Cpu className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <User className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded shrink-0", moduleColor)}>
          {moduleLabel}
        </span>
        <span className="text-xs font-medium text-foreground shrink-0">
          {actionLabel}
        </span>
        {entry.actor_agent && (
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
            {entry.actor_agent.name}
          </span>
        )}
        <span className="text-xs text-muted-foreground truncate flex-1">
          {entry.summary ?? ""}
        </span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0">
          {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

// ── Status filter tabs ───────────────────────────────────────

const CMD_STATUS_TABS: { value: CommandStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

const INBOX_STATUS_TABS: { value: InboxItemStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "leased", label: "Leased" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "dead_letter", label: "Dead Letter" },
];

// ── System actions ───────────────────────────────────────────

const SYSTEM_ACTIONS: {
  action: CommandAction;
  label: string;
  description: string;
  icon: typeof Power;
}[] = [
  {
    action: "restart_gateway",
    label: "Restart Gateway",
    description: "Restart the OpenClaw gateway daemon. All agents will briefly disconnect.",
    icon: Power,
  },
  {
    action: "update_gateway",
    label: "Update Gateway",
    description: "Pull latest images and restart. Agents will briefly disconnect.",
    icon: Download,
  },
  {
    action: "update_all",
    label: "Update All Agents",
    description: "Git pull latest code for all deployed agents.",
    icon: Download,
  },
  {
    action: "restart_dispatcher",
    label: "Restart Dispatcher",
    description: "Restart the inbox dispatcher service.",
    icon: RefreshCw,
  },
];

// ── Log view tabs ───────────────────────────────────────────

type LogView = "commands" | "inbox" | "audit";

const LOG_VIEWS: { value: LogView; label: string; icon: typeof Server }[] = [
  { value: "commands", label: "Commands", icon: Server },
  { value: "inbox", label: "Inbox", icon: Inbox },
  { value: "audit", label: "Audit Log", icon: ScrollText },
];

// ── Page ─────────────────────────────────────────────────────

export default function SystemSettingsPage() {
  return (
    <Suspense fallback={<div className="p-5"><LoadingSkeleton variant="list" count={3} /></div>}>
      <SystemSettingsInner />
    </Suspense>
  );
}

function SystemSettingsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gatewayFilter = searchParams.get("gateway") ?? "";
  const initialView = (searchParams.get("view") as LogView) || "commands";

  const [logView, setLogView] = useState<LogView>(initialView);

  const [gateways, setGateways] = useState<Gateway[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await listGatewaysAction();
      if (!cancelled && r.ok && r.data) setGateways(r.data);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setGatewayFilter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("gateway", value);
      else params.delete("gateway");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const handleViewChange = useCallback(
    (view: LogView) => {
      setLogView(view);
      const params = new URLSearchParams(searchParams.toString());
      if (view === "commands") params.delete("view");
      else params.set("view", view);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [submitting, setSubmitting] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<typeof SYSTEM_ACTIONS[number] | null>(null);

  const handleEnqueue = useCallback(async (action: CommandAction) => {
    setSubmitting(action);
    try {
      await enqueueAgentCommand({ action });
      toast.success(`${COMMAND_ACTION_LABELS[action]} queued`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enqueue command");
    } finally {
      setSubmitting(null);
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Server className="h-4 w-4" />}
        title="System"
        description="Gateway controls, command history, and activity logs."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl p-5 space-y-6">
          {/* System actions */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Actions
            </h2>
            <div className="space-y-1.5">
              {SYSTEM_ACTIONS.map((sa) => {
                const Icon = sa.icon;
                const isSubmitting = submitting === sa.action;
                return (
                  <button
                    key={sa.action}
                    onClick={() => setConfirmAction(sa)}
                    disabled={submitting !== null}
                    className="group flex items-center gap-3 w-full rounded-md border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-accent/60 disabled:opacity-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground">{sa.label}</div>
                      <div className="text-[12px] text-muted-foreground">{sa.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Log views */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Logs
              </h2>
              <div className="flex items-center gap-0.5">
                {LOG_VIEWS.map((lv) => {
                  const Icon = lv.icon;
                  return (
                    <button
                      key={lv.value}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-sm transition-colors",
                        logView === lv.value
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                      onClick={() => handleViewChange(lv.value)}
                    >
                      <Icon className="h-3 w-3" />
                      {lv.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {logView === "commands" && (
              <CommandsView
                gateways={gateways}
                gatewayFilter={gatewayFilter}
                setGatewayFilter={setGatewayFilter}
              />
            )}
            {logView === "inbox" && <InboxView />}
            {logView === "audit" && <AuditView />}
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmActionDialog
          open
          onConfirm={() => {
            handleEnqueue(confirmAction.action);
            setConfirmAction(null);
          }}
          onCancel={() => setConfirmAction(null)}
          title={confirmAction.label}
          description={confirmAction.description}
          actionLabel={confirmAction.label}
        />
      )}
    </div>
  );
}

// ── Commands view ───────────────────────────────────────────

function CommandsView({
  gateways,
  gatewayFilter,
  setGatewayFilter,
}: {
  gateways: Gateway[];
  gatewayFilter: string;
  setGatewayFilter: (v: string) => void;
}) {
  const { commands, loading, hasMore, loadMore, statusFilter, setStatusFilter } =
    useAgentCommands({
      systemOnly: false,
      ...(gatewayFilter ? { gatewayId: gatewayFilter } : {}),
    });

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-0.5">
          {CMD_STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              className={cn(
                "px-2 py-1 text-[11px] rounded-sm transition-colors",
                statusFilter === tab.value
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {gateways.length > 1 && (
          <select
            value={gatewayFilter}
            onChange={(e) => setGatewayFilter(e.target.value)}
            className="ml-auto h-6 rounded-sm border border-border/60 bg-background px-1.5 text-[11px] outline-none hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring/50"
          >
            <option value="">All gateways</option>
            {gateways.map((gw) => (
              <option key={gw.id} value={gw.id}>
                {gw.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && commands.length === 0 ? (
        <LoadingSkeleton variant="list" count={3} />
      ) : commands.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No commands"
          description="No commands have been run yet."
        />
      ) : (
        <div className="rounded-md border border-border/50">
          {commands.map((cmd) => (
            <SystemCommandRow key={cmd.id} command={cmd} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}

// ── Inbox view ──────────────────────────────────────────────

function InboxView() {
  const { items, loading, hasMore, loadMore, statusFilter, setStatusFilter } = useInboxItems();

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-0.5">
          {INBOX_STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              className={cn(
                "px-2 py-1 text-[11px] rounded-sm transition-colors",
                statusFilter === tab.value
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <LoadingSkeleton variant="list" count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No inbox items"
          description="Inbox items appear when agents receive work — task assignments, comment mentions, and contact events."
        />
      ) : (
        <div className="rounded-md border border-border/50">
          {items.map((item) => (
            <InboxRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}

// ── Audit view ──────────────────────────────────────────────

function AuditView() {
  const { entries, loading, hasMore, loadMore, filters } = useAuditLog();

  const moduleOptions = Object.entries(MODULE_LABELS) as [AuditModule, string][];
  const actionOptions = AUDIT_ACTIONS;

  return (
    <>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <select
          value={filters.moduleFilter}
          onChange={(e) => filters.setModuleFilter(e.target.value)}
          className={cn(
            "h-6 rounded-sm border border-border/60 bg-background px-1.5 text-[11px] outline-none hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring/50",
            filters.moduleFilter !== "all" && "border-foreground/30 bg-accent/50"
          )}
        >
          <option value="all">All modules</option>
          {moduleOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <select
          value={filters.actionFilter}
          onChange={(e) => filters.setActionFilter(e.target.value)}
          className={cn(
            "h-6 rounded-sm border border-border/60 bg-background px-1.5 text-[11px] outline-none hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring/50",
            filters.actionFilter !== "all" && "border-foreground/30 bg-accent/50"
          )}
        >
          <option value="all">All actions</option>
          {actionOptions.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>

        <select
          value={filters.actorFilter}
          onChange={(e) => filters.setActorFilter(e.target.value)}
          className={cn(
            "h-6 rounded-sm border border-border/60 bg-background px-1.5 text-[11px] outline-none hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-ring/50",
            filters.actorFilter !== "all" && "border-foreground/30 bg-accent/50"
          )}
        >
          <option value="all">All actors</option>
          <option value="human">Human</option>
          <option value="agent">Agent</option>
        </select>
      </div>

      {loading && entries.length === 0 ? (
        <LoadingSkeleton variant="list" count={3} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries"
          description="Audit entries are created when entities are modified across the system — CRM, tasks, agents, documents, and more."
        />
      ) : (
        <div className="rounded-md border border-border/50">
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadMore} disabled={loading}>
            {loading ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
