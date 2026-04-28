"use client";

// Settings → Connections — list page.
//
// Mirrors GatewaysSettings: PageHeader, an outer card that contains
// h-14 rows, hover-revealed actions. The Add dialog and the "Refresh"
// button enqueue commands; we listen to agent_commands realtime to
// know when results arrive.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Plug, RefreshCw, MoreHorizontal, Trash2, AlertTriangle, Star, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useRealtime } from "@/hooks/use-realtime";
import { AddConnectionDialog } from "./add-connection-dialog";
import {
  refreshConnectionsAction,
  enqueueConnectionCommand,
  waitForCommand,
  readConnectionsForGateway,
} from "@/app/dashboard/settings/connections/actions";
import {
  CONNECTION_STATUS_META,
  getProviderCatalog,
  type Connection,
  type ConnectionStatus,
} from "@/lib/connections/types";
import type { Gateway } from "@/lib/gateways/types";
import { cn } from "@/lib/utils";

interface ConnectionsSettingsProps {
  initialGateways: Gateway[];
  initialGatewayId: string | null;
  initialConnections: Connection[];
  initialLastCheckedAt: string | null;
}

export function ConnectionsSettings({
  initialGateways,
  initialGatewayId,
  initialConnections,
  initialLastCheckedAt,
}: ConnectionsSettingsProps) {
  const [gateways] = useState<Gateway[]>(initialGateways);
  const [gatewayId, setGatewayId] = useState<string | null>(initialGatewayId);
  const [connections, setConnections] = useState<Connection[]>(initialConnections);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(initialLastCheckedAt);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);

  const activeGateway = gateways.find((g) => g.id === gatewayId) ?? null;

  // Refetch cached connections for the selected gateway. Used after an
  // auth_list completes (via realtime) so we pick up the new stdout
  // without re-running the probe.
  const refetchCached = useCallback(async (gid: string) => {
    const r = await readConnectionsForGateway(gid);
    if (r.ok && r.data) {
      setConnections(r.data.connections);
      setLastCheckedAt(r.data.lastCheckedAt);
    }
  }, []);

  // Trigger a fresh probe — the runner runs `models status --probe`
  // and writes JSON to stdout; realtime tells us when it's done.
  const refresh = useCallback(async () => {
    if (!gatewayId || refreshing) return;
    setRefreshing(true);
    try {
      const r = await refreshConnectionsAction(gatewayId);
      if (!r.ok || !r.data) {
        toast.error(r.error ?? "Failed to refresh connections");
        return;
      }
      setConnections(r.data.connections);
      setLastCheckedAt(new Date().toISOString());
    } finally {
      setRefreshing(false);
    }
  }, [gatewayId, refreshing]);

  // On mount + every gateway switch, kick off a fresh probe so the
  // page reflects current health. The cached value renders immediately;
  // the probe just refreshes it.
  useEffect(() => {
    if (!gatewayId) return;
    void refresh();
    // Intentionally only on gateway change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayId]);

  // When any agent_commands row for this gateway transitions to done,
  // refetch the cached connections (handles auth_set_api_key, auth_remove,
  // auth_set_default writing fresh state).
  useRealtime({
    table: "agent_commands",
    filter: gatewayId ? `gateway_id=eq.${gatewayId}` : undefined,
    onPayload: () => {
      if (gatewayId) void refetchCached(gatewayId);
    },
  });

  const onAdded = useCallback(async () => {
    if (gatewayId) await refresh();
  }, [gatewayId, refresh]);

  const onRemove = useCallback(async (c: Connection) => {
    const r = await enqueueConnectionCommand({
      gatewayId: c.gatewayId,
      action: "auth_remove",
      payload: { profile_id: c.id },
    });
    if (!r.ok || !r.data) {
      toast.error(r.error ?? "Failed to remove connection");
      return;
    }
    const w = await waitForCommand(r.data.commandId, 15_000);
    if (!w.ok || !w.data) {
      toast.error(w.error ?? "Remove did not complete");
      return;
    }
    if (w.data.status === "failed") {
      toast.error(w.data.error_message ?? "Remove failed");
      return;
    }
    toast.success("Connection removed");
    setRemoving(null);
    await refresh();
  }, [refresh]);

  const lastCheckedLabel = useMemo(() => {
    if (!lastCheckedAt) return "Never probed";
    return `Probed ${formatDistanceToNow(new Date(lastCheckedAt), { addSuffix: true })}`;
  }, [lastCheckedAt]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Plug className="h-4 w-4" />}
        title="Connections"
        description="The AI models your agents use to think — Claude, GPT, Gemini, and more. Connect a provider here and the agents on this gateway can use it."
        primaryAction={
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={!gatewayId}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add connection
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5">
          {/* Gateway picker — only shown if there are multiple gateways */}
          {gateways.length === 0 ? (
            <EmptyState
              icon={Plug}
              title="No gateways yet"
              description="Add a gateway first — that's the machine where your agents (and the model providers they use) live."
              action={{
                label: "Go to Gateways",
                icon: Plus,
                onClick: () => {
                  window.location.href = "/dashboard/settings/gateways";
                },
              }}
            />
          ) : (
            <>
              {gateways.length > 1 && (
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span>Showing connections on</span>
                    <Select
                      value={gatewayId ?? undefined}
                      onValueChange={(v) => setGatewayId(v)}
                    >
                      <SelectTrigger className="h-7 w-[200px] text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {gateways.map((g) => (
                          <SelectItem key={g.id} value={g.id} className="text-[12px]">
                            {g.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70">
                    Each gateway has its own connections.
                  </p>
                </div>
              )}

              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[11px] text-muted-foreground/70">
                  {refreshing ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Probing providers…
                    </span>
                  ) : (
                    lastCheckedLabel
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={refreshing || !gatewayId}
                  className="h-7 text-[11px]"
                >
                  <RefreshCw
                    className={cn(
                      "mr-1.5 h-3 w-3",
                      refreshing && "animate-spin",
                    )}
                  />
                  Refresh
                </Button>
              </div>

              {connections.length === 0 ? (
                <EmptyState
                  icon={Plug}
                  title="No connections yet"
                  description="Add an API key or sign in with a provider so the agents on this gateway can use a model."
                  action={{
                    label: "Add connection",
                    icon: Plus,
                    onClick: () => setAddOpen(true),
                  }}
                  compact
                />
              ) : (
                <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                  {connections.map((c, idx) => (
                    <ConnectionRow
                      key={c.id}
                      connection={c}
                      isFirst={idx === 0}
                      onRemove={() => setRemoving(c)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {gatewayId && activeGateway && (
        <AddConnectionDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          gatewayId={gatewayId}
          gatewayLabel={activeGateway.label}
          onAdded={() => void onAdded()}
        />
      )}

      {removing && (
        <ConfirmDialog
          open
          tone="destructive"
          onCancel={() => setRemoving(null)}
          title={`Remove ${getProviderCatalog(removing.provider)?.displayName ?? removing.provider}?`}
          description={
            <>
              The credential is deleted from this gateway&apos;s auth store.
              Agents on this gateway can no longer use{" "}
              <span className="font-mono">{removing.provider}</span> until
              you add it again.
            </>
          }
          confirmLabel="Remove"
          onConfirm={() => onRemove(removing)}
        />
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────

function ConnectionRow({
  connection,
  isFirst,
  onRemove,
}: {
  connection: Connection;
  isFirst: boolean;
  onRemove: () => void;
}) {
  const catalog = getProviderCatalog(connection.provider);
  const displayName = catalog?.displayName ?? connection.provider;
  const meta = CONNECTION_STATUS_META[connection.status];

  return (
    <div
      className={cn(
        "group relative flex h-14 items-center gap-3 px-3 transition-colors hover:bg-muted/20",
        !isFirst && "border-t border-border/50",
      )}
    >
      {/* Provider icon — generic plug for now; we don't ship per-provider SVGs yet. */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-muted-foreground">
        <Plug className="h-4 w-4" />
      </div>

      {/* Name + status */}
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span className="max-w-[180px] truncate text-[13px] font-medium text-foreground">
          {displayName}
        </span>
        <StatusBadge status={connection.status} />
        {connection.isDefault && (
          <span
            title="This is the default model for new agents"
            className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
          >
            <Star className="h-2.5 w-2.5" />
            default
          </span>
        )}
      </div>

      {/* Profile name (only if non-default) */}
      {connection.profileName !== "default" && (
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
          {connection.profileName}
        </span>
      )}

      <span className="min-w-0 flex-1" />

      {/* Reason text on hover-out, hides on hover so actions take its place */}
      <span
        className="shrink-0 truncate text-[11px] text-muted-foreground/70 transition-opacity group-hover:opacity-0"
        title={meta.description}
      >
        {connection.expiresAt
          ? `Expires ${formatDistanceToNow(new Date(connection.expiresAt), { addSuffix: true })}`
          : meta.description}
      </span>

      {/* Hover-revealed actions */}
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Connection actions"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onRemove();
              }}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const meta = CONNECTION_STATUS_META[status];
  const isWarn = status === "expiring" || status === "missing_credential";
  const isError = status === "expired" || status === "invalid";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
      {isError && <AlertTriangle className="h-3 w-3 text-[var(--status-error)]" />}
      {isWarn && <AlertTriangle className="h-3 w-3 text-[var(--status-warning)]" />}
    </span>
  );
}
