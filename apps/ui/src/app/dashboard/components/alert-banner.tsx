"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Server,
  Bot,
  DollarSign,
  Terminal,
  Inbox,
  X,
} from "lucide-react";
import type { DashboardAlert } from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

const CATEGORY_ICON: Record<string, React.ElementType> = {
  gateway: Server,
  agent: Bot,
  budget: DollarSign,
  command: Terminal,
  inbox: Inbox,
};

export function AlertBanner({ alerts }: { alerts: DashboardAlert[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const shown = visible.slice(0, 3);
  const overflow = visible.length - shown.length;

  return (
    <div className="space-y-1.5">
      {shown.map((alert) => {
        const Icon = CATEGORY_ICON[alert.category] ?? AlertTriangle;
        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-center gap-3 rounded-md border px-4 py-2.5",
              alert.severity === "error"
                ? "border-[var(--status-error)]/30 bg-[var(--status-error)]/5"
                : "border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5"
            )}
          >
            <div
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
              style={{
                backgroundColor: `color-mix(in oklch, var(--status-${alert.severity}) 14%, transparent)`,
                color: `var(--status-${alert.severity})`,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span
              className={cn(
                "flex-1 text-[13px]",
                alert.severity === "error"
                  ? "text-[var(--status-error)]"
                  : "text-[var(--status-warning)]"
              )}
            >
              {alert.message}
            </span>
            <Link
              href={alert.href}
              className="shrink-0 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              View
            </Link>
            <button
              onClick={() =>
                setDismissed((prev) => new Set([...prev, alert.id]))
              }
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      {overflow > 0 && (
        <p className="pl-1 text-[11px] text-muted-foreground">
          +{overflow} more alert{overflow > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
