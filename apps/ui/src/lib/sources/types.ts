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

export interface SourceBrowseItem {
  external_id: string;
  title: string;
  source_url: string;
  item_type: string;
  has_children: boolean;
  parent_path?: string;
}

export const PROVIDER_LABELS: Record<SourceProvider, string> = {
  notion: "Notion",
  google_drive: "Google Drive",
};

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

export interface ProviderSetupStep {
  title: string;
  description: string;
  link?: { label: string; url: string };
}

export const PROVIDER_SETUP_GUIDES: Record<SourceProvider, {
  title: string;
  description: string;
  credentialLabel: string;
  credentialPlaceholder: string;
  credentialType: "token" | "json_file";
  steps: ProviderSetupStep[];
}> = {
  notion: {
    title: "Connect Notion",
    description: "Sync pages and databases from your Notion workspace.",
    credentialLabel: "Integration Token",
    credentialPlaceholder: "ntn_...",
    credentialType: "token",
    steps: [
      {
        title: "Create an integration",
        description: "Go to Notion Integrations and click \"+ New integration\". Give it a name like \"HQ Sync\" and select your workspace.",
        link: { label: "Open Notion Integrations", url: "https://www.notion.so/my-integrations" },
      },
      {
        title: "Copy the token",
        description: "Under \"Internal Integration Secret\", click \"Show\" then \"Copy\". Paste it below.",
      },
      {
        title: "Share pages with the integration",
        description: "In Notion, open any page or database you want to sync. Click ··· → Connections → find your integration and add it.",
      },
    ],
  },
  google_drive: {
    title: "Connect Google Drive",
    description: "Sync documents, spreadsheets, and files from Google Drive.",
    credentialLabel: "Service Account Key (JSON)",
    credentialPlaceholder: "Upload or paste JSON key file",
    credentialType: "json_file",
    steps: [
      {
        title: "Create a service account",
        description: "In Google Cloud Console, go to IAM → Service Accounts and create a new service account.",
        link: { label: "Open Cloud Console", url: "https://console.cloud.google.com/iam-admin/serviceaccounts" },
      },
      {
        title: "Create and download a JSON key",
        description: "Click the service account → Keys → Add Key → Create new key → JSON. Download the file.",
      },
      {
        title: "Enable the Drive API",
        description: "In Google Cloud Console, go to APIs & Services → enable \"Google Drive API\" for this project.",
        link: { label: "Enable Drive API", url: "https://console.cloud.google.com/apis/library/drive.googleapis.com" },
      },
      {
        title: "Share folders with the service account",
        description: "In Google Drive, right-click the folder → Share → paste the service account email (shown after upload). Give it \"Viewer\" access.",
      },
    ],
  },
};

export function getSourceUrl(provider: SourceProvider, externalId: string): string {
  switch (provider) {
    case "notion":
      return `https://notion.so/${externalId.replace(/-/g, "")}`;
    case "google_drive":
      return `https://drive.google.com/file/d/${externalId}`;
    default:
      return "";
  }
}
