"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";
import {
  enqueueConnectionCommand,
  readConnectionsForGateway,
  waitForCommand,
} from "@/app/dashboard/settings/connections/actions";
import { getProviderCatalog, type Connection } from "@/lib/connections/types";
import { ProviderIcon } from "./provider-icons";
import { cn } from "@/lib/utils";

export function AgentRailModelSection({ gatewayId }: { gatewayId: string }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  const load = useCallback(() => {
    void readConnectionsForGateway(gatewayId).then((r) => {
      setConnections(r.ok && r.data ? r.data.connections : []);
    });
  }, [gatewayId]);

  useEffect(() => {
    load();
  }, [load]);

  const healthy = (connections ?? []).filter((c) => c.status === "ok");

  const onSetDefault = useCallback(
    async (c: Connection) => {
      setSwitching(c.id);
      try {
        const r = await enqueueConnectionCommand({
          gatewayId,
          action: "auth_set_default",
          payload: { provider: c.provider, profile_name: c.profileName },
        });
        if (!r.ok || !r.data) {
          toast.error(r.error ?? "Failed to set default");
          return;
        }
        const w = await waitForCommand(r.data.commandId, 15_000);
        if (!w.ok || !w.data || w.data.status === "failed") {
          toast.error(
            w.data?.error_message ?? w.error ?? "Set default failed",
          );
          return;
        }
        const catalog = getProviderCatalog(c.provider);
        toast.success(`${catalog?.displayName ?? c.provider} set as default`);
        load();
      } finally {
        setSwitching(null);
      }
    },
    [gatewayId, load],
  );

  return (
    <div className="space-y-1.5">
      {/* Compact provider list with click-to-switch */}
      {healthy.length > 0 ? (
        <div className="space-y-0.5">
          {healthy.map((c) => {
            const catalog = getProviderCatalog(c.provider);
            const name = catalog?.displayName ?? c.provider;
            const isSwitching = switching === c.id;
            return (
              <button
                key={c.id}
                type="button"
                disabled={c.isDefault || !!switching}
                onClick={() => onSetDefault(c)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12px] transition-colors",
                  c.isDefault
                    ? "bg-primary/8 text-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                <ProviderIcon
                  providerId={c.provider}
                  className="h-3 w-3 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {isSwitching ? (
                  <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                ) : c.isDefault ? (
                  <Check className="h-3 w-3 shrink-0 text-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : connections !== null && connections.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">
          No models connected.
        </p>
      ) : null}

      <Link
        href="/dashboard/settings/connections"
        className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground/70 hover:text-foreground hover:underline"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Plug className="h-3 w-3" />
          Manage connections
        </span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </Link>
    </div>
  );
}
