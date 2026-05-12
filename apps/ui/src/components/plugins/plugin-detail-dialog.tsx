"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Webhook,
  Package,
  Shield,
  Store,
  CheckCircle2,
  XCircle,
  Clock,
  MinusCircle,
} from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Badge } from "@/components/ui/badge";
import {
  PLUGIN_SOURCE_META,
  PLUGIN_EVENT_STATUS_META,
  AVAILABLE_HOOKS,
  type HQPlugin,
  type PluginEventLog,
} from "@/lib/plugins/types";
import { listPluginEvents } from "@/app/dashboard/settings/plugins/actions";

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> =
  {
    builtin: Shield,
    local: Package,
    webhook: Webhook,
    marketplace: Store,
  };

const EVENT_STATUS_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  success: CheckCircle2,
  error: XCircle,
  timeout: Clock,
  skipped: MinusCircle,
};

interface PluginDetailDialogProps {
  plugin: HQPlugin | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PluginDetailDialog({
  plugin,
  open,
  onOpenChange,
}: PluginDetailDialogProps) {
  const [events, setEvents] = useState<PluginEventLog[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const fetchEvents = useCallback(async (pid: string) => {
    setEventsLoading(true);
    const r = await listPluginEvents(pid);
    if (r.ok && r.data) setEvents(r.data.events);
    setEventsLoading(false);
  }, []);

  useEffect(() => {
    if (open && plugin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchEvents(plugin.plugin_id);
    } else {
      setEvents([]);
    }
  }, [open, plugin, fetchEvents]);

  if (!plugin) return null;

  const sourceMeta = PLUGIN_SOURCE_META[plugin.source];
  const Icon = SOURCE_ICONS[plugin.source] ?? Package;
  const hookLabels = plugin.hooks.map(
    (h) => AVAILABLE_HOOKS.find((ah) => ah.value === h)?.label ?? h,
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[560px]">
        <ResponsiveDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <ResponsiveDialogTitle>{plugin.name}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {plugin.description ?? `${plugin.source} plugin`}
              </ResponsiveDialogDescription>
            </div>
          </div>
        </ResponsiveDialogHeader>

        <div className="space-y-5 px-6 pb-6">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Source
              </p>
              <div className="flex items-center gap-1.5 text-[12px] text-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: sourceMeta.color }}
                />
                {sourceMeta.label}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Version
              </p>
              <p className="text-[12px] text-foreground">{plugin.version}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Status
              </p>
              <p className="text-[12px] text-foreground">
                {plugin.is_enabled ? "Enabled" : "Disabled"}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Plugin ID
              </p>
              <p className="font-mono text-[11px] text-muted-foreground">
                {plugin.plugin_id}
              </p>
            </div>
          </div>

          {/* Webhook URL */}
          {plugin.webhook_url && (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Webhook URL
              </p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {plugin.webhook_url}
              </p>
            </div>
          )}

          {/* Hooks */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Subscribed events
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hookLabels.map((label) => (
                <Badge
                  key={label}
                  variant="secondary"
                  className="text-[11px] font-normal"
                >
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Recent events */}
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Recent activity
            </p>
            {eventsLoading ? (
              <p className="py-4 text-center text-[12px] text-muted-foreground/60">
                Loading...
              </p>
            ) : events.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-muted-foreground/60">
                No events yet
              </p>
            ) : (
              <div className="max-h-[240px] overflow-y-auto rounded-md border border-border/60 bg-card">
                {events.slice(0, 20).map((evt, idx) => {
                  const statusMeta = PLUGIN_EVENT_STATUS_META[evt.status];
                  const StatusIcon = EVENT_STATUS_ICONS[evt.status] ?? CheckCircle2;
                  return (
                    <div
                      key={evt.id}
                      className={`flex items-center gap-2.5 px-3 py-2 ${
                        idx > 0 ? "border-t border-border/30" : ""
                      }`}
                    >
                      <span
                        className="shrink-0"
                        style={{ color: statusMeta.color }}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                        {AVAILABLE_HOOKS.find((h) => h.value === evt.hook)
                          ?.label ?? evt.hook}
                      </span>
                      {evt.duration_ms != null && (
                        <span className="shrink-0 text-[10px] text-muted-foreground/50">
                          {evt.duration_ms}ms
                        </span>
                      )}
                      <span className="shrink-0 text-[10px] text-muted-foreground/50">
                        {formatDistanceToNow(new Date(evt.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                      {evt.error_message && (
                        <span
                          className="max-w-[140px] shrink-0 truncate text-[10px]"
                          style={{ color: "var(--status-error)" }}
                          title={evt.error_message}
                        >
                          {evt.error_message}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
