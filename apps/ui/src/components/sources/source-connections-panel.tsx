"use client";

import { useState } from "react";
import type { SourceConnection, SourceProvider, SourceSyncRun } from "@/lib/sources/types";
import {
  PROVIDER_LABELS,
  CONNECTION_STATUS_LABELS,
  CONNECTION_STATUS_COLORS,
} from "@/lib/sources/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import {
  Plus,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Globe,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface SourceConnectionsPanelProps {
  connections: SourceConnection[];
  syncRuns: SourceSyncRun[];
  onCreateConnection: (input: {
    provider: SourceProvider;
    account_label: string;
    credentials: Record<string, unknown>;
    sync_interval_hours?: number;
  }) => Promise<SourceConnection | null>;
  onDeleteConnection: (id: string) => Promise<void>;
  onTriggerSync: (connectionId: string) => Promise<void>;
}

export function SourceConnectionsPanel({
  connections,
  syncRuns,
  onCreateConnection,
  onDeleteConnection,
  onTriggerSync,
}: SourceConnectionsPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-heading">Knowledge Sources</h3>
          <p className="text-body text-muted-foreground">
            Connect external services to sync content into Knowledge.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          Connect
        </Button>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-6 text-center">
          <Globe className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-body text-muted-foreground">
            No sources connected yet. Connect Notion or Google Drive to sync content.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => {
            const lastRun = syncRuns.find((r) => r.connection_id === conn.id);
            return (
              <div
                key={conn.id}
                className="group flex items-center gap-3 rounded-lg border border-border/50 p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-heading">{conn.account_label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {PROVIDER_LABELS[conn.provider]}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]", CONNECTION_STATUS_COLORS[conn.status])}
                    >
                      {CONNECTION_STATUS_LABELS[conn.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                    {conn.last_verified_at && (
                      <span>
                        Verified{" "}
                        {formatDistanceToNow(new Date(conn.last_verified_at), {
                          addSuffix: true,
                        })}
                      </span>
                    )}
                    <span>Syncs every {conn.sync_interval_hours}h</span>
                    {lastRun && (
                      <span>
                        Last sync: {lastRun.items_synced} items
                        {lastRun.items_failed > 0 && `, ${lastRun.items_failed} failed`}
                      </span>
                    )}
                  </div>
                  {conn.status !== "active" && conn.error_message && (
                    <div className="flex items-center gap-1 mt-1 text-[11px] text-red-400">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{conn.error_message}</span>
                    </div>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onTriggerSync(conn.id)}>
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      Sync now
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteId(conn.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <AddConnectionDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={onCreateConnection}
      />

      <ConfirmDeleteDialog
        open={!!deleteId}
        title="Disconnect source?"
        description="This will stop syncing. Items already in Knowledge will remain but won't receive updates."
        onConfirm={async () => {
          if (deleteId) await onDeleteConnection(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

function AddConnectionDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: {
    provider: SourceProvider;
    account_label: string;
    credentials: Record<string, unknown>;
    sync_interval_hours?: number;
  }) => Promise<SourceConnection | null>;
}) {
  const [provider, setProvider] = useState<SourceProvider>("notion");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [syncInterval, setSyncInterval] = useState("6");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setProvider("notion");
    setLabel("");
    setApiKey("");
    setSyncInterval("6");
  };

  const handleSubmit = async () => {
    if (!label.trim() || !apiKey.trim()) return;
    setSaving(true);
    try {
      const result = await onSubmit({
        provider,
        account_label: label.trim(),
        credentials: { api_key: apiKey.trim() },
        sync_interval_hours: parseInt(syncInterval) || 6,
      });
      if (result) {
        reset();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Source</DialogTitle>
          <DialogDescription>
            Add an API key to connect an external knowledge source.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as SourceProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="notion">Notion</SelectItem>
                <SelectItem value="google_drive">Google Drive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={provider === "notion" ? "My Notion workspace" : "My Google Drive"}
            />
          </div>

          <div className="space-y-1.5">
            <Label>API Key / Access Token</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "notion" ? "ntn_..." : "ya29.a0..."}
            />
            <p className="text-[11px] text-muted-foreground">
              {provider === "notion"
                ? "Create an integration at notion.so/my-integrations and paste the Internal Integration Token."
                : "Use a service account key or OAuth access token."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Sync interval</Label>
            <Select value={syncInterval} onValueChange={setSyncInterval}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Every hour</SelectItem>
                <SelectItem value="6">Every 6 hours</SelectItem>
                <SelectItem value="12">Every 12 hours</SelectItem>
                <SelectItem value="24">Daily</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !label.trim() || !apiKey.trim()}>
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
