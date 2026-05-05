"use client";

import type { Task } from "@/lib/tasks/types";
import { Bot, CheckCircle2, Loader } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface AgentStatusChipProps {
  task: Task;
  compact?: boolean;
}

export function AgentStatusChip({ task, compact }: AgentStatusChipProps) {
  if (task.assignee_type !== "agent" || !task.assignee_agent) return null;

  const name = task.assignee_agent.name;

  if (task.status === "done" && task.completed_at) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1 text-[11px] text-[var(--status-success)]",
        compact && "gap-0.5"
      )}>
        <CheckCircle2 className="h-3 w-3" />
        {!compact && (
          <span className="truncate max-w-[120px]">
            {name} · {formatDistanceToNow(new Date(task.completed_at), { addSuffix: true })}
          </span>
        )}
      </span>
    );
  }

  if (task.status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--status-info)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--status-info)] opacity-40" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--status-info)]" />
        </span>
        {!compact && <span className="truncate max-w-[120px]">{name}</span>}
      </span>
    );
  }

  if (task.status === "todo") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Bot className="h-3 w-3" />
        {!compact && <span className="truncate max-w-[120px]">Queued for {name}</span>}
      </span>
    );
  }

  // Default: just show agent name
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Bot className="h-3 w-3" />
      {!compact && <span className="truncate max-w-[120px]">{name}</span>}
    </span>
  );
}
