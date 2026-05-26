"use client";

import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Ban,
  FileCheck,
  AlertOctagon,
  Wallet,
  CalendarClock,
  Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TriageItem, TriageAction } from "@/lib/types/dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  string,
  { icon: LucideIcon; iconClass: string; bgClass: string }
> = {
  overdue_task: {
    icon: AlertCircle,
    iconClass: "text-[var(--status-error)]",
    bgClass: "bg-[var(--status-error)]/8",
  },
  blocked_task: {
    icon: Ban,
    iconClass: "text-[var(--status-warning)]",
    bgClass: "bg-[var(--status-warning)]/8",
  },
  deliverable_review: {
    icon: FileCheck,
    iconClass: "text-[var(--status-info)]",
    bgClass: "bg-[var(--status-info)]/8",
  },
  failed_work: {
    icon: AlertOctagon,
    iconClass: "text-[var(--status-error)]",
    bgClass: "bg-[var(--status-error)]/8",
  },
  budget_warning: {
    icon: Wallet,
    iconClass: "text-[var(--status-warning)]",
    bgClass: "bg-[var(--status-warning)]/8",
  },
  follow_up: {
    icon: CalendarClock,
    iconClass: "text-[var(--status-info)]",
    bgClass: "bg-[var(--status-info)]/8",
  },
  notification: {
    icon: Bell,
    iconClass: "text-muted-foreground",
    bgClass: "bg-muted/40",
  },
};

function ActionButton({
  action,
  onAction,
  loading,
}: {
  action: TriageAction;
  onAction: (key: string) => void;
  loading: boolean;
}) {
  return (
    <Button
      variant={action.variant === "default" ? "default" : "outline"}
      size="sm"
      className="h-6 px-2 text-[10px] rounded-md"
      disabled={loading}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction(action.key);
      }}
    >
      {action.label}
    </Button>
  );
}

export function TriageItemRow({
  item,
  onAction,
  loading,
}: {
  item: TriageItem;
  onAction: (itemId: string, actionKey: string) => void;
  loading: boolean;
}) {
  const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.notification;
  const Icon = config.icon;

  const hasTimestamp = item.timestamp && item.timestamp.length > 0;
  let timeText = "";
  if (hasTimestamp) {
    try {
      timeText = formatDistanceToNow(new Date(item.timestamp), {
        addSuffix: true,
      });
    } catch {
      timeText = "";
    }
  }

  const hasAgent = item.agentEmoji || item.agentName;

  return (
    <li className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/20">
      {hasAgent ? (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-sm leading-none">
          {item.agentEmoji ?? item.agentName?.charAt(0) ?? "?"}
        </div>
      ) : (
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            config.bgClass,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", config.iconClass)} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {hasAgent && (
                <Icon className={cn("h-3 w-3 shrink-0", config.iconClass)} />
              )}
              <p className="truncate text-[12px] font-medium text-foreground/90">
                {item.title}
              </p>
            </div>
            <p className="truncate text-[11px] text-muted-foreground/50 mt-0.5">
              {item.agentName && (
                <span className="font-medium text-muted-foreground/70">
                  {item.agentName}
                </span>
              )}
              {item.agentName && item.subtitle && (
                <span className="mx-1 text-border">·</span>
              )}
              {item.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {item.actions.length > 0 && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.actions
                  .filter((a) => a.key !== "view")
                  .map((action) => (
                    <ActionButton
                      key={action.key}
                      action={action}
                      onAction={(key) => onAction(item.id, key)}
                      loading={loading}
                    />
                  ))}
              </div>
            )}
            {timeText && (
              <span className="text-[10px] text-muted-foreground/40 tabular-nums whitespace-nowrap">
                {timeText}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
