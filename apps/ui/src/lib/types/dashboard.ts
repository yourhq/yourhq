// Dashboard stats — Supabase-only. Pipeline breakdown is dynamic,
// keyed by stage_key from `pipeline_stages`.

import type { AuditLogEntry } from "@/lib/audit/types";

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

export interface AgentStats {
  total: number;
  online: number;
  offline: number;
  error: number;
  recentActions: number;
}

export interface FollowUpDue {
  contact_id: string;
  contact_name: string;
  next_action: string | null;
  next_action_date: string;
  interaction_id: string;
}

export interface DashboardStats {
  crm: CrmStats;
  tasks: TaskStats;
  agents: AgentStats;
  followUps: FollowUpDue[];
  recentActivity: AuditLogEntry[];
  fetchedAt: string;
}
