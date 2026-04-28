"use client";

// Settings → Gateways. Lists every gateway in the active project, with
// status, last-seen heartbeat, and reachable URL. Has a button to mint
// a registration token + display the install command for a new
// gateway.
//
// Realtime: subscribes to the `gateways` table so the list reflects
// new gateways the moment install-gateway.sh on a remote host calls
// consume_gateway_token().

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Server,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "@/hooks/use-realtime";
import { AddGatewayDialog } from "./add-gateway-dialog";
import { listGatewaysAction } from "@/app/dashboard/settings/gateways/actions";
import {
  isHeartbeatFresh,
  type Gateway,
  type GatewayStatus,
} from "@/lib/gateways/types";

interface GatewaysSettingsProps {
  initialGateways: Gateway[];
}

const STATUS_COLOR: Record<GatewayStatus, string> = {
  online: "rgb(34 197 94)", // emerald-500
  provisioning: "rgb(245 158 11)", // amber-500
  offline: "rgb(115 115 115)", // neutral-500
  error: "rgb(239 68 68)", // red-500
  paused: "rgb(245 158 11)", // amber-500
};

const STATUS_LABEL: Record<GatewayStatus, string> = {
  online: "Online",
  provisioning: "Provisioning",
  offline: "Offline",
  error: "Error",
  paused: "Paused",
};

export function GatewaysSettings({ initialGateways }: GatewaysSettingsProps) {
  const [gateways, setGateways] = useState<Gateway[]>(initialGateways);
  const [addOpen, setAddOpen] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  // Pull a fresh list when the realtime subscription fires. Cheaper to
  // re-query than to merge the payload (gateways are <10 in practice).
  const refetch = useMemo(
    () => async () => {
      const r = await listGatewaysAction();
      if (r.ok && r.data) setGateways(r.data);
    },
    [],
  );

  useRealtime({
    table: "gateways",
    onPayload: () => {
      void refetch();
    },
  });

  // Tick the "last seen X ago" labels so the freshness pill flips from
  // online → stale without a page reload. Lazy initializer keeps
  // Date.now() out of the render path.
  const [, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(i);
  }, []);

  // Suppress the unused `supabase` variable until we wire optimistic
  // updates. We hold the client so the Realtime channel created by
  // useRealtime authenticates cleanly under the per-project cookie.
  void supabase;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Server className="h-4 w-4" />}
        title="Gateways"
        description="The machines your agents run on."
        primaryAction={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Gateway
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl p-5">
          {gateways.length === 0 ? (
            <EmptyState
              icon={Server}
              title="No gateways yet"
              description="Add a gateway to start running agents."
              action={{
                label: "Add Gateway",
                icon: Plus,
                onClick: () => setAddOpen(true),
              }}
            />
          ) : (
            <div className="space-y-1.5">
              {gateways.map((gw) => (
                <GatewayRow key={gw.id} gateway={gw} />
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
    </div>
  );
}

function GatewayRow({ gateway }: { gateway: Gateway }) {
  const fresh = isHeartbeatFresh(gateway.last_seen_at);
  // If the DB row says online but no recent heartbeat, surface that as
  // a stale signal — the daemon stopped writing even if the backing
  // process is technically alive.
  const stale = gateway.status === "online" && !fresh;
  const effectiveStatus: GatewayStatus = stale ? "offline" : gateway.status;

  const lastSeen = gateway.last_seen_at
    ? formatDistanceToNow(new Date(gateway.last_seen_at), { addSuffix: true })
    : "never";

  return (
    <Link
      href={`/dashboard/settings/gateways/${gateway.id}`}
      className="group flex items-center gap-3 rounded-md border border-border/60 bg-card px-4 py-3 transition-colors hover:border-border-strong hover:bg-accent/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Server className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-foreground">
            {gateway.label}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {gateway.slug}
          </span>
          {stale && (
            <span
              title="No recent heartbeat"
              className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              stale
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot
            color={STATUS_COLOR[effectiveStatus]}
            size="sm"
            pulse={effectiveStatus === "provisioning"}
          />
          <span>{STATUS_LABEL[effectiveStatus]}</span>
          <span>·</span>
          <span>last seen {lastSeen}</span>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
    </Link>
  );
}
