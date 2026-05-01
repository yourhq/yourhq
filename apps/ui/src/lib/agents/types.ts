// Agent Types — mirrors Supabase schema

export type AgentStatus = "ready" | "error" | "paused" | "provisioning" | "hibernating";

export interface Agent {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  status: AgentStatus;
  last_seen_at: string | null;
  last_heartbeat_at: string | null;
  // FK to gateways.id — every agent runs on exactly one gateway. The
  // schema seeds a 'default' gateway so single-gateway installs Just
  // Work, but multi-gateway deployments rely on this FK to route
  // commands.
  gateway_id: string | null;
  reports_to_id: string | null;
  domains: string[];
  capabilities: string[] | null;
  heartbeat_cron: string | null;
  model: string | null;
  thinking: string | null;
  config: Record<string, unknown>;
  meta: Record<string, unknown>;
}

// Constants

export const AGENT_STATUSES: { value: AgentStatus; label: string }[] = [
  { value: "ready", label: "Ready" },
  { value: "error", label: "Error" },
  { value: "paused", label: "Paused" },
  { value: "provisioning", label: "Setting up" },
  { value: "hibernating", label: "Sleeping" },
];

export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  ready: "bg-green-500/20 text-green-400",
  error: "bg-red-500/20 text-red-400",
  paused: "bg-yellow-500/20 text-yellow-400",
  provisioning: "bg-yellow-500/20 text-yellow-400",
  hibernating: "bg-gray-500/20 text-gray-400",
};

export const AGENT_STATUS_DOT_COLORS: Record<AgentStatus, string> = {
  ready: "bg-green-500",
  error: "bg-red-500",
  paused: "bg-yellow-500",
  provisioning: "bg-yellow-500",
  hibernating: "bg-gray-500",
};

export const DOMAIN_LABELS: Record<string, string> = {
  crm: "CRM",
  tasks: "Tasks",
  assets: "Assets",
  analytics: "Analytics",
};

export const HEARTBEAT_PRESETS: { label: string; value: string | null }[] = [
  { label: "Off", value: null },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every day (9 AM)", value: "0 9 * * *" },
];

// Shape of the JSON manifest stored at agent.json in each agent branch.
export interface AgentManifest {
  slug: string;
  name: string;
  description: string;
  emoji?: string;
  team?: string;
  model?: string;
  domains?: string[];
  capabilities?: string[];
  telegram_token_env?: string;
  browser_profile_color?: string;
  [key: string]: unknown;
}

// Discovered template returned by GET /api/agents/templates
export interface AgentTemplate {
  branch: string;
  name: string;
  description: string;
  emoji?: string;
  team?: string;
  domains?: string[];
  capabilities?: string[];
}

export type AgentChannel = "telegram" | "discord" | "slack" | "none";

// Shape we stash into agents.meta via the create wizard.
export interface AgentMeta {
  emoji?: string;
  team?: string;
  template_branch?: string | null;
  channel?: AgentChannel;
  telegram_token_env?: string;
}

// ── Agent Commands (lifecycle management from UI → EC2 daemon) ──

export type CommandAction =
  | "provision"
  | "approve_pairing"
  | "update"
  | "remove"
  | "restart_gateway"
  | "update_all"
  | "restart_dispatcher"
  // Phase 3.4 — Connections (provider auth from the UI). The runner
  // translates these into `openclaw models auth …` invocations and
  // writes structured progress into `payload.connection_state`.
  | "auth_set_api_key"
  | "auth_start"
  | "auth_paste"
  | "auth_list"
  | "auth_remove"
  | "auth_refresh"
  | "auth_set_default"
  | "update_gateway"
  | "set_agent_model"
  | "list_models";

export type CommandStatus = "pending" | "leased" | "running" | "done" | "failed";

export interface AgentCommand {
  id: string;
  created_at: string;
  updated_at: string;
  gateway_id: string | null;
  agent_id: string | null;
  agent_slug: string | null;
  action: CommandAction;
  payload: Record<string, unknown>;
  status: CommandStatus;
  leased_at: string | null;
  leased_until: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  error_message: string | null;
  requested_by: string | null;
}

export const AGENT_COMMAND_ACTIONS: CommandAction[] = [
  "provision", "approve_pairing", "update", "remove",
];

export const SYSTEM_COMMAND_ACTIONS: CommandAction[] = [
  "restart_gateway", "update_all", "restart_dispatcher", "update_gateway",
];

export const CONNECTION_COMMAND_ACTIONS: CommandAction[] = [
  "auth_set_api_key", "auth_start", "auth_paste",
  "auth_list", "auth_remove", "auth_refresh", "auth_set_default",
];

export const COMMAND_ACTION_LABELS: Record<CommandAction, string> = {
  provision: "Provision",
  approve_pairing: "Approve Pairing",
  update: "Update Agent",
  remove: "Remove Agent",
  restart_gateway: "Restart Gateway",
  update_all: "Update All Agents",
  restart_dispatcher: "Restart Dispatcher",
  auth_set_api_key: "Set API key",
  auth_start: "Sign in",
  auth_paste: "Paste auth code",
  auth_list: "Refresh connections",
  auth_remove: "Remove connection",
  auth_refresh: "Probe connection",
  auth_set_default: "Set default model",
  update_gateway: "Update Gateway",
  set_agent_model: "Set agent model",
  list_models: "List models",
};

export const COMMAND_STATUS_COLORS: Record<CommandStatus, string> = {
  pending: "#3b82f6",
  leased: "#f59e0b",
  running: "#a855f7",
  done: "#22c55e",
  failed: "#ef4444",
};
