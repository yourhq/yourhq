"use client";

import { useRouter } from "next/navigation";
import {
  Notification,
  NOTIFICATION_TYPE_LABELS,
} from "@/lib/notifications/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertTriangle,
  Ban,
  Bell,
  Clock,
  UserX,
  Sparkles,
  CheckCircle2,
  Info,
  X,
  CheckCheck,
  MessageSquare,
  UserCheck,
  CircleCheck,
  ShieldAlert,
  PackageCheck,
  AlarmClock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface NotificationFeedProps {
  notifications: Notification[];
  loading: boolean;
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  follow_up: Clock,
  stale_contact: UserX,
  agent_suggestion: Sparkles,
  agent_comment: MessageSquare,
  task_reminder: CheckCircle2,
  task_assigned: UserCheck,
  task_completed: CircleCheck,
  task_blocked: ShieldAlert,
  task_overdue: AlarmClock,
  deliverable_submitted: PackageCheck,
  system: Info,
  "budget.warned": AlertTriangle,
  "budget.exceeded": Ban,
};

function entityHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "contact":
      return `/dashboard/contacts/${entityId}`;
    case "organization":
      return `/dashboard/organizations/${entityId}`;
    case "task":
      return `/dashboard/tasks?task=${entityId}`;
    case "document":
    case "knowledge_item":
      return `/dashboard/knowledge/${entityId}`;
    case "agent":
    case "agent_budget":
      return `/dashboard/agents/${entityId}`;
    case "routine":
      return `/dashboard/routines`;
    default:
      return null;
  }
}

export function NotificationFeed({
  notifications,
  loading,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: NotificationFeedProps) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-md bg-muted/30 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="You're all caught up"
        description="No notifications right now. Check back later."
      />
    );
  }

  function handleClick(n: Notification) {
    if (!n.is_read) onMarkRead(n.id);
    const href = entityHref(n.entity_type, n.entity_id);
    if (href) router.push(href);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
        </span>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onMarkAllRead}
          >
            <CheckCheck className="mr-1 h-3 w-3" />
            Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-1">
        {notifications.map((n) => {
          const Icon = TYPE_ICONS[n.type] ?? Info;
          const typeLabel = NOTIFICATION_TYPE_LABELS[n.type] ?? n.type;
          return (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`${n.title}${!n.is_read ? " (unread)" : ""}`}
              className={cn(
                "group flex items-start gap-3 rounded-md border border-border/50 px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !n.is_read && "bg-accent/20"
              )}
              onClick={() => handleClick(n)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick(n);
                }
              }}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                  !n.is_read ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">{n.title}</span>
                  {!n.is_read && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
                  )}
                </div>
                {n.body && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {n.body}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {typeLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground">·</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                aria-label="Dismiss notification"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(n.id);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
