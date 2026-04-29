"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Key,
  Loader2,
  RefreshCw,
  Terminal,
  Trash2,
} from "lucide-react";
import type { Agent, AgentCommand, AgentMeta, CommandStatus } from "@/lib/agents/types";
import { COMMAND_ACTION_LABELS, COMMAND_STATUS_COLORS } from "@/lib/agents/types";
import { useAgentCommands } from "@/hooks/use-agent-commands";
import { enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

// ── Status filter tabs ───────────────────────────────────────

const STATUS_TABS: { value: CommandStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
];

// ── Command row (expandable) ─────────────────────────────────

function CommandRow({ command }: { command: AgentCommand }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = command.stdout || command.stderr || command.error_message;

  return (
    <div className={cn("border-b border-border/50 last:border-0", command.status === "failed" && "bg-red-500/5")}>
      <button
        className="flex items-center gap-2.5 w-full px-2 py-2 text-left hover:bg-muted/30 transition-colors"
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
        <span className="text-xs text-muted-foreground truncate flex-1">
          {command.status === "running" && "Running…"}
          {command.status === "leased" && "Claimed…"}
          {command.status === "done" && command.exit_code !== null && `exit ${command.exit_code}`}
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

// ── Provisioning status banner ───────────────────────────────

function ProvisioningBanner({ commands }: { commands: AgentCommand[] }) {
  const latest = commands.find((c) => c.action === "provision");
  if (!latest) return null;

  const color = COMMAND_STATUS_COLORS[latest.status];
  const isActive = latest.status === "pending" || latest.status === "leased" || latest.status === "running";

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
      latest.status === "done" && "border-green-500/20 bg-green-500/5 text-green-400",
      latest.status === "failed" && "border-red-500/20 bg-red-500/5 text-red-400",
      isActive && "border-blue-500/20 bg-blue-500/5 text-blue-400",
    )}>
      {isActive && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      <StatusDot color={color} size="sm" />
      <span className="flex-1">
        {latest.status === "pending" && "Provisioning queued — waiting for EC2 daemon…"}
        {latest.status === "leased" && "Provisioning claimed — starting…"}
        {latest.status === "running" && "Provisioning in progress…"}
        {latest.status === "done" && "Provisioned successfully"}
        {latest.status === "failed" && `Provisioning failed: ${latest.error_message || "unknown error"}`}
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

interface AgentProvisioningProps {
  agent: Agent;
}

export function AgentProvisioning({ agent }: AgentProvisioningProps) {
  const { commands, loading, hasMore, loadMore, statusFilter, setStatusFilter } =
    useAgentCommands({ agentId: agent.id });

  const [pairingCode, setPairingCode] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const enqueue = useCallback(async (action: Parameters<typeof enqueueAgentCommand>[0]["action"], payload?: Record<string, unknown>) => {
    setSubmitting(action);
    try {
      await enqueueAgentCommand({
        agentId: agent.id,
        agentSlug: agent.slug,
        action,
        payload,
      });
      toast.success(`${COMMAND_ACTION_LABELS[action]} queued`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to enqueue command");
    } finally {
      setSubmitting(null);
    }
  }, [agent.id, agent.slug]);

  const hasProvisionCommand = commands.some((c) => c.action === "provision");
  const latestProvision = commands.find((c) => c.action === "provision");
  const isProvisioned = latestProvision?.status === "done";

  return (
    <div>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Provisioning & Operations
      </h2>

      {/* Provisioning status */}
      <ProvisioningBanner commands={commands} />

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {!hasProvisionCommand && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => enqueue("provision")}
            disabled={submitting !== null}
          >
            {submitting === "provision" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Provision
          </Button>
        )}

        {/* Pairing */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value)}
            placeholder="Pairing code"
            className="h-7 w-28 rounded border border-border/50 bg-transparent px-2 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => {
              if (!pairingCode.trim()) return;
              const meta = (agent.meta ?? {}) as AgentMeta;
              enqueue("approve_pairing", { pairing_code: pairingCode.trim(), channel: meta.channel ?? "telegram" });
              setPairingCode("");
            }}
            disabled={submitting !== null || !pairingCode.trim()}
          >
            {submitting === "approve_pairing" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
            Pair
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => enqueue("update")}
          disabled={submitting !== null}
        >
          {submitting === "update" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Update
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
          onClick={() => setConfirmRemove(true)}
          disabled={submitting !== null}
        >
          {submitting === "remove" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          Remove
        </Button>
      </div>

      {/* Command history */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">
            Command History
          </span>
        </div>

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
            icon={Terminal}
            title="No commands"
            description={statusFilter === "all" ? "No commands have been run for this agent yet." : `No ${statusFilter} commands.`}
          />
        ) : (
          <div className="rounded-md border border-border/50">
            {commands.map((cmd) => (
              <CommandRow key={cmd.id} command={cmd} />
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

      {/* Confirm remove dialog */}
      <ConfirmDeleteDialog
        open={confirmRemove}
        onConfirm={() => {
          setConfirmRemove(false);
          enqueue("remove");
        }}
        onCancel={() => setConfirmRemove(false)}
        title={`Remove agent "${agent.name}"?`}
        description="This will remove the agent from the EC2 instance (delete worktree and config). The Git branch and database record will remain."
      />
    </div>
  );
}
