// Settings → Connections.
//
// One page per gateway. If the user has multiple gateways, the client
// shell renders a picker; otherwise it picks the first one silently.

import { listGatewaysAction } from "@/app/dashboard/settings/gateways/actions";
import { readConnectionsForGateway } from "./actions";
import { ConnectionsSettings } from "@/components/connections/connections-settings";

export const dynamic = "force-dynamic";

export default async function ConnectionsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gateway?: string }>;
}) {
  const { gateway: gatewayParam } = await searchParams;
  const r = await listGatewaysAction();
  const gateways = r.ok && r.data ? r.data : [];

  // If a gateway ID was passed (e.g. from agent detail), use that.
  // Otherwise prefer online, fall back to oldest.
  const initialGateway =
    (gatewayParam ? gateways.find((g) => g.id === gatewayParam) : null) ??
    gateways.find((g) => g.status === "ready") ??
    gateways[0] ??
    null;

  // Pre-load the cached connections for snappy first paint. The client
  // component triggers a fresh probe on mount so this is just to avoid
  // the empty flash.
  const initialConnections = initialGateway
    ? (await readConnectionsForGateway(initialGateway.id)).data ?? {
        connections: [],
        lastCheckedAt: null,
      }
    : { connections: [], lastCheckedAt: null };

  return (
    <ConnectionsSettings
      initialGateways={gateways}
      initialGatewayId={initialGateway?.id ?? null}
      initialConnections={initialConnections.connections}
      initialLastCheckedAt={initialConnections.lastCheckedAt}
    />
  );
}
