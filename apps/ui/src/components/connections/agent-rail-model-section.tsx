"use client";

// Live "Model" section for the agent detail rail.
//
// Reads the cached auth_list result for the agent's gateway and renders
// a tight summary: how many providers are connected, which is default,
// and a link out to manage them. No probe is triggered here — that
// happens on the Connections page itself. This is a glanceable surface,
// not a control.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plug } from "lucide-react";
import { readConnectionsForGateway } from "@/app/dashboard/settings/connections/actions";
import { getProviderCatalog, type Connection } from "@/lib/connections/types";

export function AgentRailModelSection({ gatewayId }: { gatewayId: string }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readConnectionsForGateway(gatewayId).then((r) => {
      if (cancelled) return;
      setConnections(r.ok && r.data ? r.data.connections : []);
    });
    return () => {
      cancelled = true;
    };
  }, [gatewayId]);

  const healthy = (connections ?? []).filter((c) => c.status === "ok");
  const defaultConn = (connections ?? []).find((c) => c.isDefault);
  const summary = (() => {
    if (connections === null) return null;
    if (connections.length === 0) return "No models connected.";
    if (defaultConn) {
      const name =
        getProviderCatalog(defaultConn.provider)?.displayName ?? defaultConn.provider;
      return `${name} (default) · ${healthy.length} healthy`;
    }
    return `${healthy.length} of ${connections.length} healthy`;
  })();

  return (
    <div className="space-y-1">
      <Link
        href="/dashboard/settings/connections"
        className="flex items-center justify-between gap-2 text-[12px] text-foreground hover:underline"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Plug className="h-3 w-3 text-muted-foreground" />
          {connections === null ? "Loading…" : "Manage providers"}
        </span>
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      </Link>
      {summary && (
        <p className="text-[11px] text-muted-foreground/80">{summary}</p>
      )}
      <p className="text-[11px] text-muted-foreground/60">
        Connected on this agent&apos;s gateway. Shared across all agents that
        run there.
      </p>
    </div>
  );
}
