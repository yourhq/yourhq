import { PROVIDER_MANIFESTS, type ProviderManifest } from "./generated-manifests";

export type { ProviderManifest };

export type SourceProvider = string;

export type SourceConnectionStatus = "active" | "expired" | "revoked" | "error";

export type SyncRunStatus = "running" | "done" | "failed";

export interface SourceConnection {
  id: string;
  created_at: string;
  updated_at: string;
  provider: string;
  account_label: string;
  credentials: Record<string, unknown>;
  status: SourceConnectionStatus;
  last_verified_at: string | null;
  sync_interval_hours: number;
  next_sync_at: string | null;
  error_message: string | null;
  meta: Record<string, unknown>;
  writable?: boolean;
}

export interface SourceSyncRun {
  id: string;
  created_at: string;
  connection_id: string;
  status: SyncRunStatus;
  items_synced: number;
  items_failed: number;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

export interface SourceBrowseItem {
  external_id: string;
  title: string;
  source_url: string;
  item_type: string;
  has_children: boolean;
  parent_path?: string;
}

export const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_MANIFESTS).map(([id, m]) => [id, m.name]),
);

export const CONNECTION_STATUS_LABELS: Record<SourceConnectionStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  error: "Error",
};

export const CONNECTION_STATUS_COLORS: Record<SourceConnectionStatus, string> = {
  active: "bg-status-success/20 text-status-success",
  expired: "bg-status-warning/20 text-status-warning",
  revoked: "bg-status-error/20 text-status-error",
  error: "bg-status-error/20 text-status-error",
};

export function getSourceUrl(provider: string, externalId: string): string {
  const manifest = PROVIDER_MANIFESTS[provider];
  if (!manifest?.source_url_template) return "";
  return manifest.source_url_template
    .replace("{external_id}", externalId)
    .replace("{external_id_no_dashes}", externalId.replace(/-/g, ""));
}
