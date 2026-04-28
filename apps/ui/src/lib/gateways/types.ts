// Public type for the `gateways` row as the UI consumes it. We project
// `meta` into specific fields the UI cares about so callers don't have
// to drill into jsonb on every render — anything we add to meta later
// gets a typed accessor here.

export type GatewayStatus =
  | "online"
  | "offline"
  | "provisioning"
  | "error"
  | "paused";

export interface GatewayReachableUrls {
  base?: string;
  files_api?: string;
  novnc?: string;
}

export interface GatewayMeta {
  reachable_urls?: GatewayReachableUrls;
  networking_mode?: string;
  version?: string;
  registered_via?: string;
  tailscale_ip?: string;
  exit_node?: string;
  // Anything else that hasn't been promoted to a typed field yet.
  [key: string]: unknown;
}

export interface Gateway {
  id: string;
  slug: string;
  label: string;
  status: GatewayStatus;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  meta: GatewayMeta;
}

// Heartbeat freshness threshold. Anything older than this and the UI
// shows the gateway as "stale" even if its DB row still says online —
// the gateway's own daemon stopped writing.
export const HEARTBEAT_FRESH_SECONDS = 90;

export function isHeartbeatFresh(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const age = Date.now() - new Date(lastSeenAt).getTime();
  return age < HEARTBEAT_FRESH_SECONDS * 1000;
}
