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
  due_at: string | null;
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
  assignee_agent?: { id: string; name: string; slug: string; avatar_url: string | null } | null;
  series?: Pick<TaskSeries, "id" | "cadence_type" | "interval_n" | "days_of_week" | "day_of_month" | "time_of_day" | "timezone"> | null;
  comment_count?: number;
  attachment_count?: number;
  subtasks?: Task[];
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
  assignee_agent?: { id: string; name: string; slug: string; avatar_url: string | null } | null;
}

// Attachment types

export type AttachmentEntityType = "document" | "asset" | "url";

export interface TaskAttachment {
  id: string;
  created_at: string;
  task_id: string;
  entity_type: AttachmentEntityType;
  entity_id: string | null;
  url: string | null;
  label: string | null;
  added_by: string;
  // Resolved from joined entity
  resolved_name?: string;
  resolved_icon?: string;
  resolved_asset_type?: string;
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
  actor_agent?: { id: string; name: string; slug: string; avatar_url: string | null } | null;
  replies?: Comment[];
}

// Comment attachment reference (stored in comment.meta.attachments)
export interface CommentAttachmentRef {
  entity_type: AttachmentEntityType;
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
  todo: "bg-gray-500/20 text-gray-400",
  in_progress: "bg-blue-500/20 text-blue-400",
  blocked: "bg-red-500/20 text-red-400",
  done: "bg-green-500/20 text-green-400",
  cancelled: "bg-zinc-500/20 text-zinc-400",
  missed: "bg-amber-500/20 text-amber-400",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  urgent: "bg-red-500/20 text-red-400",
  high: "bg-orange-500/20 text-orange-400",
  medium: "bg-yellow-500/20 text-yellow-400",
  low: "bg-slate-500/20 text-slate-400",
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
