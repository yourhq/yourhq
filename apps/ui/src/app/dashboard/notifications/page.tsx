"use client";

import { useMemo, useState } from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { NotificationFeed } from "@/components/notifications/notification-feed";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "unread" | string;

const TYPE_FILTERS = Object.entries(NOTIFICATION_TYPE_LABELS);

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllRead,
    dismiss,
  } = useNotifications();

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const filteredNotifications = useMemo(() => {
    if (activeFilter === "all") return notifications;
    if (activeFilter === "unread") return notifications.filter((n) => !n.read_at);
    return notifications.filter((n) => n.type === activeFilter);
  }, [notifications, activeFilter]);

  // Count unread per type for badge hints
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of notifications) {
      counts[n.type] = (counts[n.type] ?? 0) + 1;
    }
    return counts;
  }, [notifications]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Bell className="h-4 w-4" />}
        title="Notifications"
        description="Follow-ups, agent suggestions, and system updates."
        primaryAction={
          unreadCount > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {/* Filter tabs */}
      {notifications.length > 0 && (
        <div className="shrink-0 border-b border-border/60">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-0.5 overflow-x-auto px-5 py-1.5">
            <FilterTab
              label="All"
              active={activeFilter === "all"}
              count={notifications.length}
              onClick={() => setActiveFilter("all")}
            />
            <FilterTab
              label="Unread"
              active={activeFilter === "unread"}
              count={unreadCount}
              onClick={() => setActiveFilter("unread")}
            />
            <div className="mx-1.5 h-3 w-px bg-border/60" />
            {TYPE_FILTERS.map(([value, label]) => {
              const count = typeCounts[value] ?? 0;
              if (count === 0) return null;
              return (
                <FilterTab
                  key={value}
                  label={label}
                  active={activeFilter === value}
                  count={count}
                  onClick={() => setActiveFilter(value)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl p-5">
          <NotificationFeed
            notifications={filteredNotifications}
            loading={loading}
            unreadCount={activeFilter === "all" ? unreadCount : filteredNotifications.filter((n) => !n.read_at).length}
            onMarkRead={markAsRead}
            onMarkAllRead={markAllRead}
            onDismiss={dismiss}
          />
        </div>
      </div>
    </div>
  );
}

function FilterTab({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors",
        active
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            "tabular-nums text-[10px]",
            active ? "text-foreground/70" : "text-muted-foreground/60"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
