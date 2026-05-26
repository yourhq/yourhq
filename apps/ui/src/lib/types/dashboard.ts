import type { AuditLogEntry } from "@/lib/audit/types";

// ── Pipeline & CRM ────────────────────────────────────────────────

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

// ── Tasks ─────────────────────────────────────────────────────────

export interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
  overdue: number;
}

export interface TaskCompletionDay {
  day: string;
  completed: number;
}

// ── Infrastructure ────────────────────────────────────────────────

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

// ── Spend ─────────────────────────────────────────────────────────

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

// ── Briefing Bar ──────────────────────────────────────────────────

export interface BriefingAgentUpdate {
  agentEmoji: string | null;
  agentName: string;
  taskTitles: string[];
}

export interface BriefingSummary {
  ownerPreferredName: string | null;
  since: string;
  agentUpdates: BriefingAgentUpdate[];
  deliverablesAwaitingReview: number;
  failedItems: number;
  spendSinceUsd: number;
  newContacts: number;
  skillsLearned: number;
}

// ── Agent Fleet Grid ──────────────────────────────────────────────

export interface AgentFleetEnriched {
  id: string;
  name: string;
  slug: string;
  status: string;
  emoji: string | null;
  role: string | null;
  description: string | null;
  last_seen_at: string | null;
  avatar_url: string | null;
  currentWork: string | null;
  currentWorkType: "active" | "idle" | null;
  lastActivity: string | null;
  lastActivityAt: string | null;
  todayTasksCompleted: number;
  todaySpendUsd: number;
}

// ── Triage Queue ──────────────────────────────────────────────────

export type TriageItemType =
  | "overdue_task"
  | "blocked_task"
  | "deliverable_review"
  | "failed_work"
  | "budget_warning"
  | "follow_up"
  | "notification";

export interface TriageAction {
  key: string;
  label: string;
  variant: "default" | "destructive" | "outline";
}

export interface TriageItem {
  id: string;
  type: TriageItemType;
  title: string;
  subtitle: string | null;
  href: string;
  urgency: number;
  timestamp: string;
  agentName: string | null;
  agentEmoji: string | null;
  entityId: string;
  entityType: string;
  actions: TriageAction[];
}

// ── Usage & Budget ────────────────────────────────────────────────

export interface AgentBudgetDetail {
  agentId: string;
  agentName: string;
  agentEmoji: string | null;
  status: "ok" | "warned" | "exceeded" | "unmetered";
  spendUsd: number;
  limitUsd: number | null;
  tokens: number;
  meteredCalls: number;
  lastUsageAt: string | null;
}

export interface UsageBudgetData {
  totalSpendUsd: number;
  totalTokens: number;
  totalBudgetLimitUsd: number | null;
  agentBudgets: AgentBudgetDetail[];
  dailySpend7d: { day: string; spend_usd: number }[];
  warnedCount: number;
  exceededCount: number;
}

// ── Workspace Pulse ───────────────────────────────────────────────

export type PulseTab = "tasks" | "pipeline" | "spend" | "usage" | "system";

export interface WorkspacePulseData {
  tasks: TaskStats & { completionTrend7d: TaskCompletionDay[] };
  crm: CrmStats;
  spend: SpendSummary;
  usage: UsageBudgetData;
  gateways: GatewaySummary[];
  commandQueue: CommandQueueStats;
  inboxQueue: InboxQueueStats;
  smartDefaultTab: PulseTab;
}

// ── Activity Stream ───────────────────────────────────────────────

export interface ActivityStreamResult {
  entries: AuditLogEntry[];
  hasMore: boolean;
}

// ── Legacy (kept for backward compat with actions.ts) ─────────────

export interface DashboardAlert {
  id: string;
  severity: "error" | "warning";
  category: "gateway" | "agent" | "budget" | "command" | "inbox";
  message: string;
  href: string;
}

export interface ActionItem {
  id: string;
  type: "overdue_task" | "blocked_task" | "follow_up" | "notification";
  title: string;
  subtitle: string | null;
  href: string;
  urgency: number;
  timestamp: string;
}

export interface AgentFleetItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  last_seen_at: string | null;
  avatar_url: string | null;
}

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
