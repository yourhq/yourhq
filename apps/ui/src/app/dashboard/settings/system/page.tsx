"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  ChevronRight,
  Loader2,
  Power,
  RefreshCw,
  Server,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useAgentCommands } from "@/hooks/use-agent-commands";
import { enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import type { AgentCommand, CommandAction, CommandStatus } from "@/lib/agents/types";
import { COMMAND_ACTION_LABELS, COMMAND_STATUS_COLORS } from "@/lib/agents/types";
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
import { ChevronDown } from "lucide-react";

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

// ── Status filter tabs ───────────────────────────────────────

const STATUS_TABS: { value: CommandStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
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

// ── Page ─────────────────────────────────────────────────────

export default function SystemSettingsPage() {
  const { commands, loading, hasMore, loadMore, statusFilter, setStatusFilter } =
    useAgentCommands({ systemOnly: false }); // Show all commands here

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
        description="EC2 instance controls and command history."
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

          {/* Command history */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Command History
            </h2>

            <div className="flex items-center gap-0.5 mb-2">
              {STATUS_TABS.map((tab) => (
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
