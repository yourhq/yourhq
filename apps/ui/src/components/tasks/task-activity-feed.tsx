"use client";

import { useEntityAuditLog } from "@/hooks/use-audit-log";
import type { AuditLogEntry } from "@/lib/audit/types";
import { formatDistanceToNow } from "date-fns";
import { Bot, ArrowRight, UserPlus, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const actionIcons: Record<string, typeof ArrowRight> = {
  status_changed: ArrowRight,
  assigned: UserPlus,
  updated: Pencil,
  created: Plus,
};

function EntryRow({ entry }: { entry: AuditLogEntry }) {
  const Icon = actionIcons[entry.action] || Pencil;
  const isAgent = entry.actor_type === "agent";

  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
        isAgent ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
      )}>
        {isAgent ? <Bot className="h-2.5 w-2.5" /> : <Icon className="h-2.5 w-2.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-foreground/80 leading-relaxed">
          {entry.summary || `${entry.action}`}
        </p>
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
      </span>
    </div>
  );
}

export function TaskActivityFeed({ taskId }: { taskId: string }) {
  const { entries, loading } = useEntityAuditLog({ entity_type: "task", entity_id: taskId });

  if (loading) {
    return (
      <div className="py-3 text-center text-[11px] text-muted-foreground/50">
        Loading activity...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-3 text-center text-[11px] text-muted-foreground/50">
        No activity yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {entries.slice(0, 20).map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
