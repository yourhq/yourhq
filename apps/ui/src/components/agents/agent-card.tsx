"use client";

import type { Agent } from "@/lib/agents/types";
import type { AgentMeta } from "@/lib/agents/types";
import { Bot, Pencil, Pause, Play, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAgentBudget } from "@/hooks/use-agent-budget";
import { BUDGET_STATUS_META } from "@/lib/usage/types";

const STATUS_PRIORITY: Record<string, number> = {
  ready: 0,
  paused: 1,
  error: 2,
  provisioning: 3,
  hibernating: 4,
};

export const AGENT_STATUS: Record<
  string,
  { color: string; label: string; pulse?: boolean }
> = {
  ready: { color: "var(--status-success)", label: "Ready", pulse: true },
  error: { color: "var(--status-error)", label: "Error" },
  paused: { color: "var(--status-warning)", label: "Paused" },
  provisioning: { color: "var(--status-warning)", label: "Setting up", pulse: true },
  hibernating: { color: "var(--status-neutral)", label: "Sleeping" },
};

/**
 * Sort agents: online first, then paused, error, offline.
 * Within each group, alphabetical by name.
 */
export function sortAgentsByStatus(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9;
    const pb = STATUS_PRIORITY[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Group agents by team (from meta.team), each group sorted by status then name.
 * Teams are ordered alphabetically; "Ungrouped" goes last.
 */
export function groupAgentsByTeam(
  agents: Agent[]
): { team: string; agents: Agent[] }[] {
  const map = new Map<string, Agent[]>();
  for (const a of agents) {
    const team = ((a.meta as AgentMeta)?.team as string) || "Ungrouped";
    if (!map.has(team)) map.set(team, []);
    map.get(team)!.push(a);
  }
  const groups = Array.from(map.entries()).map(([team, items]) => ({
    team,
    agents: sortAgentsByStatus(items),
  }));
  groups.sort((a, b) => {
    if (a.team === "Ungrouped") return 1;
    if (b.team === "Ungrouped") return -1;
    return a.team.localeCompare(b.team);
  });
  return groups;
}

/**
 * Compute fleet status counts for the strip.
 */
export function getFleetCounts(agents: Agent[]) {
  const counts: { status: string; count: number; color: string; label: string }[] = [];
  const map = new Map<string, number>();
  for (const a of agents) {
    map.set(a.status, (map.get(a.status) ?? 0) + 1);
  }
  // Show in priority order, skip zero counts
  for (const [status, cfg] of Object.entries(AGENT_STATUS)) {
    const c = map.get(status) ?? 0;
    if (c > 0) counts.push({ status, count: c, color: cfg.color, label: cfg.label.toLowerCase() });
  }
  return counts;
}

interface AgentRowProps {
  agent: Agent;
  depth?: number;
  onEdit?: (agent: Agent) => void;
  onTogglePause?: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
}

export function AgentRow({
  agent,
  depth = 0,
  onEdit,
  onTogglePause,
  onDelete,
}: AgentRowProps) {
  const status = AGENT_STATUS[agent.status] ?? AGENT_STATUS.error;
  const meta = (agent.meta ?? {}) as AgentMeta;
  const emoji = meta.emoji;

  return (
    <div
      className="group relative flex h-14 items-center gap-3 rounded-md px-3 transition-colors hover:bg-muted/20"
      style={depth > 0 ? { paddingLeft: `${12 + depth * 24}px` } : undefined}
    >
      <Link
        href={`/dashboard/agents/${agent.id}`}
        className="absolute inset-0 rounded-md"
        aria-label={agent.name}
      />

      {/* Emoji / avatar */}
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

      {/* Name + status */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="truncate text-[13px] font-medium text-foreground max-w-[160px]">
          {agent.name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status.pulse && "animate-pulse"
            )}
            style={{ backgroundColor: status.color }}
          />
          {status.label}
        </span>
      </div>

      {/* Slug */}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
        @{agent.slug}
      </span>

      {/* Description */}
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
        {agent.description ?? ""}
      </span>

      {/* Usage pill */}
      <AgentUsagePill agentId={agent.id} />

      {/* Last seen — hidden when actions are visible */}
      <span className="shrink-0 text-[11px] text-muted-foreground/50 transition-opacity group-hover:opacity-0">
        {agent.last_seen_at
          ? formatDistanceToNow(new Date(agent.last_seen_at), {
              addSuffix: true,
            })
          : "Never"}
      </span>

      {/* Hover actions */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
        {onEdit && (
          <AgentIconButton
            label="Edit"
            onClick={() => onEdit(agent)}
            icon={<Pencil className="h-3 w-3" />}
          />
        )}
        {onTogglePause && (
          <AgentIconButton
            label={agent.status === "paused" ? "Resume" : "Pause"}
            onClick={() => onTogglePause(agent.id, agent.status)}
            icon={
              agent.status === "paused" ? (
                <Play className="h-3 w-3" />
              ) : (
                <Pause className="h-3 w-3" />
              )
            }
          />
        )}
        {onDelete && (
          <AgentIconButton
            label="Delete"
            onClick={() => onDelete(agent.id)}
            icon={<Trash2 className="h-3 w-3" />}
            destructive
          />
        )}
      </div>
    </div>
  );
}

export function AgentUsagePill({ agentId }: { agentId: string }) {
  const { budget } = useAgentBudget(agentId);
  if (!budget || (budget.current_period_spend_usd === 0 && budget.current_period_tokens === 0)) {
    return null;
  }

  const spend = budget.current_period_spend_usd;
  const hasLimit = budget.monthly_limit_usd != null;
  const meta = BUDGET_STATUS_META[budget.status];

  const label = hasLimit
    ? `$${spend.toFixed(2)} / $${budget.monthly_limit_usd!.toFixed(0)}`
    : spend > 0
      ? `$${spend.toFixed(2)}`
      : `${(budget.current_period_tokens / 1000).toFixed(0)}K tok`;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-muted-foreground/70"
      title={meta.description}
    >
      {(budget.status === "warned" || budget.status === "exceeded") && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
      )}
      {label}
    </span>
  );
}

export function AgentIconButton({
  label,
  onClick,
  icon,
  destructive = false,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        destructive && "hover:text-destructive"
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
