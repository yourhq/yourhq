"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SourceConnection, SourceSyncRun } from "@/lib/sources/types";
import {
  PROVIDER_LABELS,
  CONNECTION_STATUS_COLORS,
  CONNECTION_STATUS_LABELS,
} from "@/lib/sources/types";
import {
  useSourceConnections,
  type SourceKnowledgeItem,
} from "@/hooks/use-source-connections";
import { DetailHeader } from "@/components/shared/detail-header";
import { SourceContentPicker } from "@/components/sources/source-content-picker";
import {
  DetailSidebar,
  DetailSidebarMobile,
  DetailSidebarSection,
  DetailSidebarPropertyGrid,
  DetailSidebarProperty,
} from "@/components/shared/detail-sidebar";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SourceConnectionDetailProps {
  connection: SourceConnection;
}

type Tab = "items" | "history";

export function SourceConnectionDetail({
  connection: initial,
}: SourceConnectionDetailProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sc = useSourceConnections();
  const [tab, setTab] = useState<Tab>("items");

  useEffect(() => {
    if (searchParams.get("oauth") === "success") {
      toast.success(`Connected to ${initial.account_label}`);
      router.replace(`/dashboard/settings/sources/${initial.id}`);
    }
  }, [searchParams, router, initial.id, initial.account_label]);
  const [items, setItems] = useState<SourceKnowledgeItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [stopItemId, setStopItemId] = useState<string | null>(null);

  const connection = sc.getConnection(initial.id) ?? initial;

  const refreshItems = useCallback(async () => {
    const data = await sc.actions.fetchConnectionItems(connection.id);
    setItems(data);
    setLoadingItems(false);
  }, [sc.actions, connection.id]);

  const refreshRuns = useCallback(async () => {
    await sc.actions.fetchSyncRuns(connection.id);
  }, [sc.actions, connection.id]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    refreshItems();
    refreshRuns();
  }, [refreshItems, refreshRuns]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filteredRuns = useMemo(
    () => sc.syncRuns.filter((r) => r.connection_id === connection.id),
    [sc.syncRuns, connection.id],
  );

  const handleDisconnect = async () => {
    await sc.actions.deleteConnection(connection.id);
    router.push("/dashboard/settings/sources");
  };

  const handleStopSyncing = async () => {
    if (!stopItemId) return;
    await sc.actions.stopSyncingItem(stopItemId);
    setStopItemId(null);
    refreshItems();
  };

  const sidebarContent = (
    <>
      <DetailSidebarSection title="Connection">
        <DetailSidebarPropertyGrid>
          <DetailSidebarProperty label="Provider">
            {PROVIDER_LABELS[connection.provider]}
          </DetailSidebarProperty>
          <DetailSidebarProperty label="Label">
            {connection.account_label}
          </DetailSidebarProperty>
          <DetailSidebarProperty label="Status">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                CONNECTION_STATUS_COLORS[connection.status],
              )}
            >
              {CONNECTION_STATUS_LABELS[connection.status]}
            </Badge>
          </DetailSidebarProperty>
        </DetailSidebarPropertyGrid>
      </DetailSidebarSection>

      <DetailSidebarSection title="Settings">
        <DetailSidebarPropertyGrid>
          <DetailSidebarProperty label="Sync every">
            <Select
              value={String(connection.sync_interval_hours)}
              onValueChange={(v) =>
                sc.actions.updateConnection(connection.id, {
                  sync_interval_hours: parseInt(v),
                })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 hour</SelectItem>
                <SelectItem value="6">6 hours</SelectItem>
                <SelectItem value="12">12 hours</SelectItem>
                <SelectItem value="24">24 hours</SelectItem>
              </SelectContent>
            </Select>
          </DetailSidebarProperty>
          <DetailSidebarProperty label="Token">
            <span className="font-mono text-[11px]">••••••••</span>
          </DetailSidebarProperty>
        </DetailSidebarPropertyGrid>
      </DetailSidebarSection>

      <DetailSidebarSection title="Actions">
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => sc.actions.triggerSync(connection.id)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync now
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>
      </DetailSidebarSection>
    </>
  );

  return (
    <>
      <DetailHeader
        back={{ href: "/dashboard/settings/sources", label: "Sources" }}
        identityIcon={
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-[13px] font-semibold text-muted-foreground">
            {connection.provider === "notion" ? "N" : "G"}
          </div>
        }
        identityTitle={connection.account_label}
        identityMeta={
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              CONNECTION_STATUS_COLORS[connection.status],
            )}
          >
            {CONNECTION_STATUS_LABELS[connection.status]}
          </Badge>
        }
        secondaryActions={
          <DetailSidebarMobile title={connection.account_label}>
            {sidebarContent}
          </DetailSidebarMobile>
        }
        overflow={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => sc.actions.triggerSync(connection.id)}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Sync now
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center border-b border-border/60 px-5">
            <div className="flex items-center gap-1 flex-1">
              <TabButton
                active={tab === "items"}
                onClick={() => setTab("items")}
                count={items.length}
              >
                Items
              </TabButton>
              <TabButton
                active={tab === "history"}
                onClick={() => setTab("history")}
                count={filteredRuns.length}
              >
                Sync History
              </TabButton>
            </div>
            {tab === "items" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 text-xs"
                onClick={() => setShowPicker(true)}
              >
                <Plus className="h-3 w-3" />
                Add
              </Button>
            )}
          </div>

          {tab === "items" ? (
            <ItemsTab
              items={items}
              loading={loadingItems}
              connection={connection}
              onStopSyncing={setStopItemId}
              onSyncItem={(id) => {
                sc.actions.syncItemNow(id);
                refreshItems();
              }}
            />
          ) : (
            <HistoryTab runs={filteredRuns} />
          )}
        </div>

        <DetailSidebar>{sidebarContent}</DetailSidebar>
      </div>

      <ConfirmDeleteDialog
        open={showDelete}
        title="Disconnect source?"
        description="This will stop syncing. Items already in Knowledge will remain but won't receive updates."
        onConfirm={handleDisconnect}
        onCancel={() => setShowDelete(false)}
      />

      <ConfirmDeleteDialog
        open={!!stopItemId}
        title="Stop syncing this item?"
        description="The item will be archived in Knowledge and will no longer receive updates from the source."
        onConfirm={handleStopSyncing}
        onCancel={() => setStopItemId(null)}
      />

      <SourceContentPicker
        open={showPicker}
        connectionId={connection.id}
        provider={connection.provider}
        existingSyncedIds={
          new Set(
            items
              .map((i) => i.source_external_id)
              .filter((id): id is string => id != null),
          )
        }
        onSync={async (selectedItems) => {
          const ok = await sc.actions.addSyncItems(
            connection.id,
            selectedItems,
          );
          if (ok) refreshItems();
          return ok;
        }}
        onClose={() => setShowPicker(false)}
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative px-3 py-2.5 text-[13px] font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex items-center gap-1.5">
        {children}
        {typeof count === "number" && count > 0 && (
          <span className="text-[11px] text-muted-foreground">{count}</span>
        )}
      </span>
      {active && (
        <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-foreground" />
      )}
    </button>
  );
}

function ItemsTab({
  items,
  loading,
  connection,
  onStopSyncing,
  onSyncItem,
}: {
  items: SourceKnowledgeItem[];
  loading: boolean;
  connection: SourceConnection;
  onStopSyncing: (id: string) => void;
  onSyncItem: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
        Loading items...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-[13px] text-muted-foreground">
          No items syncing yet. Use the content picker to select pages to sync.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {items.map((item) => (
        <div
          key={item.id}
          className="group flex items-center gap-3 px-5 py-2.5"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate">
              {item.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <SyncStatusIndicator status={item.source_sync_status} />
              {item.source_synced_at && (
                <span className="text-[11px] text-muted-foreground">
                  Synced{" "}
                  {formatDistanceToNow(new Date(item.source_synced_at), {
                    addSuffix: true,
                  })}
                </span>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSyncItem(item.id)}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Sync now
              </DropdownMenuItem>
              {item.source_external_id && (
                <DropdownMenuItem asChild>
                  <a
                    href={
                      connection.provider === "notion"
                        ? `https://notion.so/${item.source_external_id.replace(/-/g, "")}`
                        : `https://drive.google.com/file/d/${item.source_external_id}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Open in {PROVIDER_LABELS[connection.provider]}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onStopSyncing(item.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Stop syncing
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}

function SyncStatusIndicator({ status }: { status: string | null }) {
  switch (status) {
    case "synced":
      return (
        <span className="flex items-center gap-1 text-[11px] text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          Synced
        </span>
      );
    case "stale":
      return (
        <span className="flex items-center gap-1 text-[11px] text-yellow-400">
          <Clock className="h-3 w-3" />
          Pending sync
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1 text-[11px] text-red-400">
          <XCircle className="h-3 w-3" />
          Sync failed
        </span>
      );
    case "source_deleted":
      return (
        <span className="flex items-center gap-1 text-[11px] text-red-400">
          <AlertTriangle className="h-3 w-3" />
          Deleted in source
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Waiting
        </span>
      );
  }
}

function HistoryTab({ runs }: { runs: SourceSyncRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground">
        No sync history yet.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {runs.map((run) => (
        <div key={run.id} className="flex items-center gap-3 px-5 py-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {run.status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : run.status === "failed" ? (
                <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
              )}
              <span className="text-[13px] text-foreground">
                {run.status === "running"
                  ? "Syncing..."
                  : run.status === "done"
                    ? `${run.items_synced} synced${run.items_failed > 0 ? `, ${run.items_failed} failed` : ""}`
                    : run.error_message ?? "Sync failed"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {format(new Date(run.created_at), "MMM d, yyyy · h:mm a")}
              {run.completed_at &&
                run.started_at &&
                ` · ${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
