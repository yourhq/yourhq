export type SourceProvider = "notion" | "google_drive";

export type SourceConnectionStatus = "active" | "expired" | "revoked" | "error";

export type SyncRunStatus = "running" | "done" | "failed";

export interface SourceConnection {
  id: string;
  created_at: string;
  updated_at: string;
  provider: SourceProvider;
  account_label: string;
  credentials: Record<string, unknown>;
  status: SourceConnectionStatus;
  last_verified_at: string | null;
  sync_interval_hours: number;
  next_sync_at: string | null;
  error_message: string | null;
  meta: Record<string, unknown>;
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

export const PROVIDER_LABELS: Record<SourceProvider, string> = {
  notion: "Notion",
  google_drive: "Google Drive",
};

export const PROVIDER_ICONS: Record<SourceProvider, string> = {
  notion: "notion",
  google_drive: "google-drive",
};

export const CONNECTION_STATUS_LABELS: Record<SourceConnectionStatus, string> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
  error: "Error",
};

export const CONNECTION_STATUS_COLORS: Record<SourceConnectionStatus, string> = {
  active: "bg-green-500/20 text-green-400",
  expired: "bg-yellow-500/20 text-yellow-400",
  revoked: "bg-red-500/20 text-red-400",
  error: "bg-red-500/20 text-red-400",
};
