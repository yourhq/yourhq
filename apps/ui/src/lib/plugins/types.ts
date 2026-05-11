export type PluginSource = "builtin" | "local" | "webhook" | "marketplace";
export type PluginEventStatus = "success" | "error" | "timeout" | "skipped";

export interface HQPlugin {
  id: string;
  created_at: string;
  updated_at: string;
  plugin_id: string;
  name: string;
  description: string | null;
  version: string;
  source: PluginSource;
  is_enabled: boolean;
  hooks: string[];
  entry_module: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  config: Record<string, unknown>;
  config_schema: Record<string, unknown> | null;
  capabilities: string[];
  installed_by: string | null;
  meta: Record<string, unknown>;
}

export interface PluginEventLog {
  id: string;
  created_at: string;
  plugin_id: string;
  hook: string;
  entity_type: string | null;
  entity_id: string | null;
  status: PluginEventStatus;
  duration_ms: number | null;
  error_message: string | null;
}

export const PLUGIN_SOURCE_META: Record<
  PluginSource,
  { label: string; color: string }
> = {
  builtin: { label: "Built-in", color: "var(--status-info)" },
  local: { label: "Local", color: "var(--status-success)" },
  webhook: { label: "Webhook", color: "var(--status-progress)" },
  marketplace: { label: "Marketplace", color: "var(--status-warning)" },
};

export const PLUGIN_EVENT_STATUS_META: Record<
  PluginEventStatus,
  { label: string; color: string }
> = {
  success: { label: "Success", color: "var(--status-success)" },
  error: { label: "Error", color: "var(--status-error)" },
  timeout: { label: "Timeout", color: "var(--status-warning)" },
  skipped: { label: "Skipped", color: "var(--status-neutral)" },
};

export const AVAILABLE_HOOKS: {
  value: string;
  label: string;
  description: string;
}[] = [
  { value: "task.created", label: "Task Created", description: "When a new task is created" },
  { value: "task.completed", label: "Task Completed", description: "When a task is marked done" },
  { value: "task.assigned", label: "Task Assigned", description: "When a task is assigned to an agent" },
  { value: "agent.provisioned", label: "Agent Provisioned", description: "When a new agent is set up" },
  { value: "agent.deprovisioned", label: "Agent Removed", description: "When an agent is removed" },
  { value: "agent.status_changed", label: "Agent Status Changed", description: "When an agent's status changes" },
  { value: "knowledge.created", label: "Knowledge Created", description: "When a knowledge item is added" },
  { value: "knowledge.processed", label: "Knowledge Processed", description: "When file text is extracted" },
  { value: "knowledge.embedded", label: "Knowledge Embedded", description: "When embeddings are generated" },
  { value: "inbox.created", label: "Inbox Item Created", description: "When an inbox item is queued" },
  { value: "inbox.completed", label: "Inbox Item Completed", description: "When an inbox item is done" },
  { value: "routine.triggered", label: "Routine Triggered", description: "When a routine fires" },
  { value: "comment.created", label: "Comment Created", description: "When a comment is posted" },
  { value: "secret.changed", label: "Secret Changed", description: "When a secret is added, updated, or removed" },
  { value: "usage.recorded", label: "Usage Recorded", description: "When LLM usage is logged" },
  { value: "budget.exceeded", label: "Budget Exceeded", description: "When an agent exceeds its budget" },
];
