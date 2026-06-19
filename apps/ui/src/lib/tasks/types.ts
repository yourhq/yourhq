// Task & Stream Types — mirrors Supabase schema

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled" | "missed";
export type CadenceType = "daily" | "weekdays" | "weekly" | "monthly" | "every_n_days";
export type MissedPolicy = "auto_skip" | "queue";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type StreamType = "functional" | "project" | "custom";
export type ActorType = "human" | "agent" | "system";

export interface Stream {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  type: StreamType;
  color: string;
  icon: string | null;
  is_archived: boolean;
  sort_order: number;
  meta: Record<string, unknown>;
  // Computed
  task_count?: number;
}

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;
  stream_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_type: ActorType | null;
  assignee_agent_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  tags: string[];
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  archived_at: string | null;
  meta: Record<string, unknown>;
  model_override: string | null;
  thinking_override: string | null;
  series_id: string | null;
  series_occurrence_at: string | null;
  // Joined
  stream?: Stream | null;
  assignee_agent?: { id: string; name: string; slug: string; avatar_url: string | null; meta?: Record<string, unknown> } | null;
  series?: Pick<TaskSeries, "id" | "cadence_type" | "interval_n" | "days_of_week" | "day_of_month" | "time_of_day" | "timezone"> | null;
  comment_count?: number;
  attachment_count?: number;
  subtasks?: Task[];
  subtask_count?: number;
  subtask_done_count?: number;
  labels?: Label[];
  blocker_count?: number;
  deliverable_count?: number;
}

export interface TaskSeries {
  id: string;
  created_at: string;
  updated_at: string;
  stream_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  assignee_type: ActorType | null;
  assignee_agent_id: string | null;
  tags: string[];
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  model_override: string | null;
  thinking_override: string | null;
  meta: Record<string, unknown>;
  cadence_type: CadenceType;
  interval_n: number;
  days_of_week: number[];
  day_of_month: number | null;
  time_of_day: string; // "HH:MM" or "HH:MM:SS"
  timezone: string;
  is_paused: boolean;
  starts_on: string;
  ends_on: string | null;
  ends_after_count: number | null;
  spawned_count: number;
  next_occurrence_at: string | null;
  last_spawned_at: string | null;
  missed_policy: MissedPolicy;
  // Joined
  stream?: Stream | null;
  assignee_agent?: { id: string; name: string; slug: string; avatar_url: string | null; meta?: Record<string, unknown> } | null;
}

export interface Comment {
  id: string;
  created_at: string;
  updated_at: string;
  entity_type: string;
  entity_id: string;
  parent_id: string | null;
  actor_type: ActorType;
  actor_agent_id: string | null;
  body: string;
  mentions: string[];
  meta: Record<string, unknown>;
  // Joined
  actor_agent?: { id: string; name: string; slug: string; avatar_url: string | null; meta?: Record<string, unknown> } | null;
  replies?: Comment[];
}

export interface CommentAttachmentRef {
  entity_type: "knowledge_item" | "url";
  entity_id?: string;
  url?: string;
  label: string;
}

// Constants

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
  { value: "missed", label: "Missed" },
];

export const CADENCE_TYPES: { value: CadenceType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "every_n_days", label: "Every N days" },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const STREAM_TYPES: { value: StreamType; label: string }[] = [
  { value: "functional", label: "Functional" },
  { value: "project", label: "Project" },
  { value: "custom", label: "Custom" },
];

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-status-neutral/20 text-status-neutral",
  in_progress: "bg-status-info/20 text-status-info",
  blocked: "bg-status-error/20 text-status-error",
  done: "bg-status-success/20 text-status-success",
  cancelled: "bg-status-neutral/20 text-status-neutral",
  missed: "bg-status-warning/20 text-status-warning",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-priority-urgent/20 text-priority-urgent",
  high: "bg-priority-high/20 text-priority-high",
  medium: "bg-priority-medium/20 text-priority-medium",
  low: "bg-priority-low/20 text-priority-low",
};

export const STATUS_ICONS: Record<TaskStatus, string> = {
  todo: "circle",
  in_progress: "loader",
  blocked: "alert-circle",
  done: "check-circle-2",
  cancelled: "x-circle",
  missed: "clock-alert",
};

export const DAY_OF_WEEK_LABELS: { value: number; short: string; label: string }[] = [
  { value: 0, short: "S", label: "Sun" },
  { value: 1, short: "M", label: "Mon" },
  { value: 2, short: "T", label: "Tue" },
  { value: 3, short: "W", label: "Wed" },
  { value: 4, short: "T", label: "Thu" },
  { value: 5, short: "F", label: "Fri" },
  { value: 6, short: "S", label: "Sat" },
];

// ── Labels ────────────────────────────────────────────────────────

export interface Label {
  id: string;
  created_at: string;
  name: string;
  color: string;
  description: string | null;
}

// ── Task Relations ────────────────────────────────────────────────

export type TaskRelationType = "blocks" | "blocked_by" | "relates_to" | "parent_of" | "child_of";

export interface TaskRelation {
  id: string;
  created_at: string;
  source_task_id: string;
  target_task_id: string;
  relation_type: TaskRelationType;
  created_by_type: ActorType;
  created_by_agent_id: string | null;
  related_task?: {
    id: string;
    title: string;
    status: TaskStatus;
    assignee_agent?: { name: string } | null;
  };
}

export const RELATION_TYPES: {
  value: TaskRelationType;
  label: string;
  icon: string;
  inverse: TaskRelationType;
}[] = [
  { value: "blocked_by", label: "Blocked by", icon: "Ban", inverse: "blocks" },
  { value: "blocks", label: "Blocks", icon: "ShieldAlert", inverse: "blocked_by" },
  { value: "relates_to", label: "Related to", icon: "Link2", inverse: "relates_to" },
  { value: "parent_of", label: "Parent of", icon: "GitBranch", inverse: "child_of" },
  { value: "child_of", label: "Sub-task of", icon: "CornerDownRight", inverse: "parent_of" },
];

// ── Task Templates ────────────────────────────────────────────────

export interface TaskTemplate {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  items: TaskTemplateItem[];
  meta: Record<string, unknown>;
}

export interface TaskTemplateItem {
  ref: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignee_role?: string;
  labels?: string[];
  blocked_by?: string[];
}

export const LABEL_PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
];
