"use client";

import { useRouter } from "next/navigation";
import type { AuditLogEntry } from "@/lib/audit/types";
import { MODULE_COLORS } from "@/lib/audit/types";
import { cn } from "@/lib/utils";
import { Bot, User, Cog, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";

interface ActivityItemProps {
  entry: AuditLogEntry;
}

const actorIcons = {
  human: User,
  agent: Bot,
  system: Cog,
};

function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "contact":
      return `/dashboard/contacts/${entityId}`;
    case "organization":
      return `/dashboard/organizations/${entityId}`;
    case "task":
      return `/dashboard/tasks?task=${entityId}`;
    case "agent":
      return `/dashboard/agents/${entityId}`;
    case "document":
      return `/dashboard/documents?doc=${entityId}`;
    case "asset":
      return `/dashboard/assets?asset=${entityId}`;
    default:
      return null;
  }
}

export function ActivityItem({ entry }: ActivityItemProps) {
  const router = useRouter();
  const ActorIcon = actorIcons[entry.actor_type];
  const actorName =
    entry.actor_type === "agent" && entry.actor_agent
      ? entry.actor_agent.name
      : entry.actor_type === "human"
        ? "You"
        : "System";

  const href =
    entry.action !== "deleted"
      ? entityHref(entry.entity_type, entry.entity_id)
      : null;

  const handleClick = () => {
    if (href) router.push(href);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group flex gap-2.5 py-2 border-b border-border/50 last:border-0 transition-colors",
        href && "cursor-pointer hover:bg-accent/40 -mx-2 px-2 rounded-md"
      )}
    >
      <div className="shrink-0 mt-0.5">
        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
          <ActorIcon className="h-3 w-3" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium">{actorName}</span>
          <span className="text-xs text-muted-foreground">
            {entry.summary || `${entry.action} ${entry.entity_type}`}
          </span>
          <span className={cn("text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground", MODULE_COLORS[entry.module])}>
            {entry.module}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {format(new Date(entry.created_at), "MMM d, h:mm a")}
        </span>
      </div>
      {href && (
        <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
