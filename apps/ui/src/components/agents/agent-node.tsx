"use client";

import Link from "next/link";
import { Bot, Pencil, Pause, Play, Trash2 } from "lucide-react";
import type { Agent, AgentMeta } from "@/lib/agents/types";
import { cn } from "@/lib/utils";
import {
  AGENT_STATUS,
  AgentIconButton,
  AgentUsagePill,
} from "@/components/agents/agent-card";

interface AgentNodeProps {
  agent: Agent;
  variant?: "default" | "pill";
  asSelf?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onEdit?: (agent: Agent) => void;
  onTogglePause?: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
}

/**
 * Boxed agent card used by the org chart canvas (variant="default")
 * and the detail-page neighborhood slice (variant="pill"). Density and
 * trim match the existing AgentRow so swapping views feels continuous.
 *
 * `asSelf` renders without a link — used for the focal agent on the
 * detail page where navigation would be a no-op.
 */
export function AgentNode({
  agent,
  variant = "default",
  asSelf = false,
  className,
  style,
  onEdit,
  onTogglePause,
  onDelete,
}: AgentNodeProps) {
  const status = AGENT_STATUS[agent.status] ?? AGENT_STATUS.error;
  const meta = (agent.meta ?? {}) as AgentMeta;
  const emoji = meta.emoji;
  const hasActions = Boolean(onEdit || onTogglePause || onDelete);

  const isPill = variant === "pill";

  return (
    <div
      style={style}
      className={cn(
        "group relative flex items-center gap-2 rounded-md border border-border/60 bg-background transition-colors hover:bg-muted/30",
        isPill ? "h-8 px-2 text-[12px]" : "h-[52px] px-2.5",
        asSelf && "ring-1 ring-foreground/20 bg-accent/40 hover:bg-accent/40",
        className,
      )}
    >
      {!asSelf && (
        <Link
          href={`/dashboard/agents/${agent.slug}`}
          className="absolute inset-0 rounded-md"
          aria-label={agent.name}
        />
      )}

      {/* Avatar */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded bg-muted/50",
          isPill ? "h-5 w-5 text-[12px]" : "h-7 w-7 text-[14px]",
        )}
      >
        {agent.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agent.avatar_url}
            alt=""
            className={cn(
              "rounded object-cover",
              isPill ? "h-5 w-5" : "h-7 w-7",
            )}
          />
        ) : emoji ? (
          <span>{emoji}</span>
        ) : (
          <Bot
            className={cn(
              "text-muted-foreground",
              isPill ? "h-3 w-3" : "h-3.5 w-3.5",
            )}
          />
        )}
      </div>

      {/* Status dot */}
      <span
        className={cn(
          "shrink-0 rounded-full",
          isPill ? "h-1 w-1" : "h-1.5 w-1.5",
          status.pulse && "animate-pulse",
        )}
        style={{ backgroundColor: status.color }}
        title={status.label}
      />

      {/* Name */}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-medium text-foreground",
          isPill ? "text-[12px]" : "text-[13px]",
        )}
      >
        {agent.name}
      </span>

      {/* Slug + usage — only on the default size */}
      {!isPill && (
        <>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
            @{agent.slug}
          </span>
          <AgentUsagePill agentId={agent.id} />
        </>
      )}

      {/* Hover actions */}
      {hasActions && !isPill && (
        <div className="absolute right-1.5 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 bg-background/90 opacity-0 transition-opacity group-hover:opacity-100">
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
      )}
    </div>
  );
}
