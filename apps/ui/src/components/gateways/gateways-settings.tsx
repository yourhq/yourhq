"use client";

// Settings → Gateways. Mirrors the row shape of /dashboard/agents — a
// single-line h-14 row with status dot, slug, last-seen, and
// hover-revealed actions. The container styling matches Settings →
// Projects (bordered card with internal dividers).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Server,
  AlertTriangle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useRealtime } from "@/hooks/use-realtime";
import { AddGatewayDialog } from "./add-gateway-dialog";
import {
  listGatewaysAction,
  removeGatewayAction,
} from "@/app/dashboard/settings/gateways/actions";
import {
  GATEWAY_STATUS,
  isHeartbeatFresh,
  type Gateway,
  type GatewayStatus,
} from "@/lib/gateways/types";
import { cn } from "@/lib/utils";

interface GatewaysSettingsProps {
  initialGateways: Gateway[];
}

export function GatewaysSettings({ initialGateways }: GatewaysSettingsProps) {
  const [gateways, setGateways] = useState<Gateway[]>(initialGateways);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Gateway | null>(null);
  const router = useRouter();

  const refetch = useMemo(
    () => async () => {
      const r = await listGatewaysAction();
      if (r.ok && r.data) setGateways(r.data);
    },
    [],
  );

  useRealtime({
    table: "gateways",
    onPayload: () => void refetch(),
  });

  // Re-render every 10s so "last seen" labels age. Lazy-init keeps
  // Date.now() out of the render path.
  const [, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Server className="h-4 w-4" />}
        title="Gateways"
        description="A gateway is a computer where your agents live and do work — like a laptop, a Mac mini at home, or a small cloud server. You can have one or several."
        primaryAction={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add gateway
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5">
          {gateways.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No gateways yet"
              description="Add the first computer where your agents will run. Most people start with one — the machine they're on now or a spare laptop."
              action={{
                label: "Add gateway",
                icon: Plus,
                onClick: () => setAddOpen(true),
              }}
            />
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60 bg-card">
              {gateways.map((gw, idx) => (
                <GatewayRow
                  key={gw.id}
                  gateway={gw}
                  isFirst={idx === 0}
                  onDelete={() => setDeleting(gw)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AddGatewayDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => void refetch()}
      />

      {deleting && (
        <ConfirmDialog
          open
          tone="destructive"
          onCancel={() => setDeleting(null)}
          title={`Remove ${deleting.label}?`}
          description={
            <>
              This removes the <span className="font-mono">{deleting.slug}</span>{" "}
              row from the registry. The container on the host machine keeps
              running until you stop it manually with{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                docker compose down
              </code>
              .
            </>
          }
          confirmLabel="Remove"
          onConfirm={async () => {
            const r = await removeGatewayAction(deleting.id);
            if (!r.ok) {
              toast.error(r.error ?? "Failed to remove gateway");
              return;
            }
            setDeleting(null);
            toast.success("Gateway removed");
            await refetch();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function GatewayRow({
  gateway,
  isFirst,
  onDelete,
}: {
  gateway: Gateway;
  isFirst: boolean;
  onDelete: () => void;
}) {
  const fresh = isHeartbeatFresh(gateway.last_seen_at);
  // If the DB row says online but no recent heartbeat, surface that as
  // a stale signal — the daemon stopped writing even if the backing
  // process is technically alive.
  const stale = gateway.status === "online" && !fresh;
  const effectiveStatus: GatewayStatus = stale ? "offline" : gateway.status;
  const status = GATEWAY_STATUS[effectiveStatus];

  const lastSeen = gateway.last_seen_at
    ? formatDistanceToNow(new Date(gateway.last_seen_at), { addSuffix: true })
    : "Never";

  return (
    <div
      className={cn(
        "group relative flex h-14 items-center gap-3 px-3 transition-colors hover:bg-muted/20",
        !isFirst && "border-t border-border/50",
      )}
    >
      <Link
        href={`/dashboard/settings/gateways/${gateway.id}`}
        className="absolute inset-0"
        aria-label={gateway.label}
      />

      {/* Icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-muted-foreground">
        <Server className="h-4 w-4" />
      </div>

      {/* Name + status */}
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <span className="max-w-[160px] truncate text-[13px] font-medium text-foreground">
          {gateway.label}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              status.pulse && "animate-pulse",
            )}
            style={{ backgroundColor: status.color }}
          />
          {status.label}
        </span>
        {stale && (
          <span
            title="No recent heartbeat"
            className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            stale
          </span>
        )}
      </div>

      {/* Slug */}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground/60">
        {gateway.slug}
      </span>

      {/* Spacer fills the row */}
      <span className="min-w-0 flex-1" />

      {/* Last seen — hides on hover so actions can take its place */}
      <span className="shrink-0 text-[11px] text-muted-foreground/50 transition-opacity group-hover:opacity-0">
        {lastSeen}
      </span>

      {/* Hover-revealed actions */}
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Gateway actions"
              onClick={(e) => e.preventDefault()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onDelete();
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
