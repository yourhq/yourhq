import type { AuditLogEntry } from "@/lib/audit/types";

// ── Shared (kept from previous version) ────────────────────────────

export interface PipelineStageCount {
  stage_key: string;
  label: string;
  color: string | null;
  count: number;
  is_terminal: boolean;
}

export interface CrmStats {
  pipeline: PipelineStageCount[];
  totalContacts: number;
  contactsAddedThisWeek: number;
  followupsDue: number;
  interactionsThisWeek: number;
}

export interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
  overdue: number;
}

// ── Alert banner ───────────────────────────────────────────────────

export interface DashboardAlert {
  id: string;
  severity: "error" | "warning";
  category: "gateway" | "agent" | "budget" | "command" | "inbox";
  message: string;
  href: string;
}

// ── Infrastructure ─────────────────────────────────────────────────

export interface GatewaySummary {
  id: string;
  slug: string;
  label: string;
  status: string;
  last_seen_at: string | null;
}

export interface CommandQueueStats {
  pending: number;
  running: number;
  failed_24h: number;
}

export interface InboxQueueStats {
  pending: number;
  failed: number;
  dead_letter: number;
}

// ── Action items ───────────────────────────────────────────────────

export interface ActionItem {
  id: string;
  type: "overdue_task" | "blocked_task" | "follow_up" | "notification";
  title: string;
  subtitle: string | null;
  href: string;
  urgency: number;
  timestamp: string;
}

// ── Spend ──────────────────────────────────────────────────────────

export interface SpendSummary {
  total_spend_usd: number;
  total_tokens: number;
  agent_count: number;
  warned_count: number;
  exceeded_count: number;
  unmetered_count: number;
  daily_spend_7d: { day: string; spend_usd: number }[];
  top_spenders: { agent_id: string; agent_name: string; spend_usd: number }[];
}

// ── Agent fleet ────────────────────────────────────────────────────

export interface AgentFleetItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  last_seen_at: string | null;
  avatar_url: string | null;
}

// ── Root stats object ──────────────────────────────────────────────

export interface DashboardStats {
  alerts: DashboardAlert[];
  agentCounts: { online: number; total: number; error: number };
  gatewayCounts: { online: number; total: number };
  activeTaskCount: number;
  overdueCount: number;
  followUpCount: number;
  actionItems: ActionItem[];
  agentFleet: AgentFleetItem[];
  gateways: GatewaySummary[];
  commandQueue: CommandQueueStats;
  inboxQueue: InboxQueueStats;
  crm: CrmStats;
  tasks: TaskStats;
  spend: SpendSummary;
  recentActivity: AuditLogEntry[];
  fetchedAt: string;
}
