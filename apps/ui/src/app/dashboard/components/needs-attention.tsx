import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Ban,
  CalendarClock,
  Bell,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import type { ActionItem } from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  ActionItem["type"],
  { icon: React.ElementType; color: string; label: string }
> = {
  overdue_task: {
    icon: AlertCircle,
    color: "var(--status-error)",
    label: "Overdue",
  },
  blocked_task: {
    icon: Ban,
    color: "var(--status-warning)",
    label: "Blocked",
  },
  follow_up: {
    icon: CalendarClock,
    color: "var(--status-info)",
    label: "Follow-up",
  },
  notification: {
    icon: Bell,
    color: "var(--status-neutral)",
    label: "Notification",
  },
};

export function NeedsAttention({ items }: { items: ActionItem[] }) {
  if (items.length === 0) {
    return (
      <section className="rounded-md border border-border/60 bg-card p-5">
        <h2 className="mb-4 text-heading">Needs attention</h2>
        <div className="flex items-center gap-2 py-4 text-[var(--status-success)]">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-body">Nothing needs your attention</span>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <h2 className="mb-4 text-heading">Needs attention</h2>
      <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/60">
        {items.map((item) => {
          const cfg = TYPE_CONFIG[item.type];
          const Icon = cfg.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${cfg.color} 12%, transparent)`,
                    color: cfg.color,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">
                    {item.title}
                  </div>
                  {item.subtitle && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {item.subtitle}
                    </div>
                  )}
                </div>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    backgroundColor: `color-mix(in oklch, ${cfg.color} 10%, transparent)`,
                    color: cfg.color,
                  }}
                >
                  {cfg.label}
                </span>
                {item.timestamp && (
                  <span
                    className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                    title={
                      item.timestamp
                        ? format(new Date(item.timestamp), "PPp")
                        : undefined
                    }
                  >
                    {(() => {
                      try {
                        return formatDistanceToNow(new Date(item.timestamp), {
                          addSuffix: true,
                        });
                      } catch {
                        return "";
                      }
                    })()}
                  </span>
                )}
                <ChevronRight className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                )} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
