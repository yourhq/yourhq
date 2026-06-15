"use client";

import { useState } from "react";
import {
  HardDrive,
  Download,
  Trash2,
  RefreshCw,
  Shield,
  Clock,
  Server,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useRealtime } from "@/hooks/use-realtime";
import {
  listGatewayBackupsAction,
  triggerBackupAction,
  deleteBackupAction,
  type BackupInfo,
} from "@/app/dashboard/settings/backups/actions";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface BackupsSettingsProps {
  initialBackups: BackupInfo[];
}

export function BackupsSettings({ initialBackups }: BackupsSettingsProps) {
  const [backups, setBackups] = useState<BackupInfo[]>(initialBackups);
  const [backingUp, setBackingUp] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BackupInfo | null>(null);

  const refetch = async () => {
    const r = await listGatewayBackupsAction();
    if (r.ok && r.data) setBackups(r.data);
  };

  useRealtime({
    table: "gateways",
    onPayload: () => void refetch(),
  });

  const handleBackup = async (gatewayId: string) => {
    setBackingUp(gatewayId);
    try {
      await triggerBackupAction(gatewayId);
      toast.success("Backup started — this may take a few seconds.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start backup");
    } finally {
      setTimeout(() => setBackingUp(null), 3000);
    }
  };

  const handleDelete = async (info: BackupInfo) => {
    try {
      const r = await deleteBackupAction(info.gatewaySlug);
      if (!r.ok) {
        toast.error(r.error ?? "Failed to delete backup");
        return;
      }
      toast.success("Backup deleted");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete backup");
    }
    setDeleting(null);
  };

  const hasAnyBackup = backups.some((b) => b.lastBackupAt);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<HardDrive className="h-4 w-4" />}
        title="Backups"
        description="Gateway state backups protect your agent auth tokens, configs, and secrets. Backups are created automatically on shutdown and can be triggered manually."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5 space-y-6">
          {/* How it works */}
          <PageSection
            title="How backups work"
            description="Each gateway's state is backed up to Supabase Storage as a compressed archive."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <InfoCard
                icon={Shield}
                title="Automatic"
                description="Backups run on gateway shutdown (SIGTERM) so state is captured before the process exits."
              />
              <InfoCard
                icon={Clock}
                title="Restore on boot"
                description="When a gateway starts fresh with no local state, it restores from the newest backup — if corrupt, it tries the next."
              />
              <InfoCard
                icon={Download}
                title="On-demand"
                description="Trigger a backup anytime from this page. Useful before maintenance or risky changes."
              />
            </div>
          </PageSection>

          {/* Gateway backup list */}
          <PageSection title="Gateways">
            {backups.length === 0 ? (
              <EmptyState
                icon={Server}
                title="No gateways"
                description="Add a gateway first — backups will appear here automatically."
              />
            ) : (
              <div className="overflow-hidden rounded-md border border-border/60 bg-card">
                {backups.map((info, idx) => (
                  <GatewayBackupRow
                    key={info.gatewayId}
                    info={info}
                    isFirst={idx === 0}
                    isBackingUp={backingUp === info.gatewayId}
                    onBackup={() => handleBackup(info.gatewayId)}
                    onDelete={() => setDeleting(info)}
                  />
                ))}
              </div>
            )}
          </PageSection>

          {/* Backup contents explanation */}
          {hasAnyBackup && (
            <PageSection title="What's included">
              <div className="rounded-md border border-border/40 bg-muted/20 p-4 text-[13px] text-muted-foreground space-y-2">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" />
                  <span>Auth stores (OAuth tokens, API keys) — so you never need to reauth</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" />
                  <span>Agent configs (openclaw.json, per-agent settings)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" />
                  <span>Secrets and shared-auth files</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <span>Excluded: browser profiles, npm cache, git repo, logs (rebuilt on boot)</span>
                </div>
                <div className="mt-3 border-t border-border/30 pt-3 text-[12px] text-muted-foreground/70">
                  Retention: last 3 backups per gateway, auto-pruned after 7 days.
                  Restore tries newest first and falls back if corrupt.
                </div>
              </div>
            </PageSection>
          )}
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          open
          tone="destructive"
          onCancel={() => setDeleting(null)}
          title={`Delete backup for ${deleting.gatewayLabel}?`}
          description={
            <>
              This removes the stored backup for{" "}
              <span className="font-mono">{deleting.gatewaySlug}</span>. The
              gateway will start fresh if it needs to be recreated. A new
              backup will be created on the next shutdown.
            </>
          }
          confirmLabel="Delete backup"
          onConfirm={() => handleDelete(deleting)}
        />
      )}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 p-3.5">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-[13px] font-medium text-foreground">{title}</div>
      <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
        {description}
      </div>
    </div>
  );
}

function GatewayBackupRow({
  info,
  isFirst,
  isBackingUp,
  onBackup,
  onDelete,
}: {
  info: BackupInfo;
  isFirst: boolean;
  isBackingUp: boolean;
  onBackup: () => void;
  onDelete: () => void;
}) {
  const isOnline = info.gatewayStatus === "ready" && info.lastSeenAt &&
    Date.now() - new Date(info.lastSeenAt).getTime() < 90_000;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3",
        !isFirst && "border-t border-border/50",
      )}
    >
      {/* Gateway info */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-muted-foreground">
        <Server className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">
            {info.gatewayLabel}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground/60">
            {info.gatewaySlug}
          </span>
        </div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">
          {info.lastBackupAt ? (
            <>
              Last backup{" "}
              {formatDistanceToNow(new Date(info.lastBackupAt), {
                addSuffix: true,
              })}
              {info.lastBackupSizeBytes != null && (
                <> · {formatBytes(info.lastBackupSizeBytes)}</>
              )}
            </>
          ) : (
            <span className="text-muted-foreground/50">No backup yet</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onBackup}
          disabled={isBackingUp || !isOnline}
          title={!isOnline ? "Gateway must be online to back up" : "Create backup now"}
        >
          {isBackingUp ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          {isBackingUp ? "Backing up..." : "Back up now"}
        </Button>
        {info.lastBackupAt && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title="Delete backup"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
