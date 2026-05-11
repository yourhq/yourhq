export type SecretCategory = "user" | "channel" | "integration";
export type SecretSyncStatus = "pending" | "active" | "error" | "waiting";

export interface Secret {
  id: string;
  created_at: string;
  updated_at: string;
  gateway_id: string;
  agent_id: string | null;
  key: string;
  name: string;
  category: SecretCategory;
  note: string | null;
  sync_status: SecretSyncStatus;
  last_synced_at: string | null;
}

export interface AgentSecretView extends Secret {
  scope: "agent" | "gateway";
}

export const SECRET_SYNC_META: Record<
  SecretSyncStatus,
  { label: string; color: string; description: string }
> = {
  active: {
    label: "Active",
    color: "var(--status-success)",
    description: "Stored securely on the gateway.",
  },
  pending: {
    label: "Updating...",
    color: "var(--status-warning)",
    description: "Waiting for the gateway to pick up this change.",
  },
  error: {
    label: "Sync error",
    color: "var(--status-error)",
    description: "Something went wrong syncing to the gateway.",
  },
  waiting: {
    label: "Waiting for gateway",
    color: "var(--status-neutral)",
    description: "The gateway is offline.",
  },
};

export const SECRET_CATEGORY_LABELS: Record<SecretCategory, string> = {
  user: "Custom",
  channel: "Channel",
  integration: "Integration",
};
