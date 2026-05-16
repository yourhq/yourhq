export type TriggerType = "schedule" | "event";

export type RoutineCadenceType =
  | "every_n_minutes"
  | "every_n_hours"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "every_n_days";

export type RoutineCondition = "created" | "changed_to" | "changed_from" | "any_change";

export type RoutineEntityType = "contact" | "collection_record" | "knowledge_item" | "task";

export interface Routine {
  id: string;
  created_at: string;
  updated_at: string;
  agent_id: string;
  agent_slug: string;
  name: string;
  instruction: string;
  trigger_type: TriggerType;
  is_active: boolean;
  cadence_type: RoutineCadenceType | null;
  interval_n: number | null;
  days_of_week: number[];
  day_of_month: number | null;
  time_of_day: string | null;
  timezone: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  run_count: number;
  entity_type: RoutineEntityType | null;
  collection_id: string | null;
  field: string | null;
  condition: RoutineCondition | null;
  value: string | null;
  meta: Record<string, unknown>;
  archived_at: string | null;
  agent?: { id: string; name: string; slug: string; meta?: Record<string, unknown> } | null;
}

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  schedule: "Schedule",
  event: "Event",
};

export const TRIGGER_TYPE_COLORS: Record<TriggerType, string> = {
  schedule: "bg-accent-blue/20 text-accent-blue",
  event: "bg-accent-amber/20 text-accent-amber",
};

export const CADENCE_OPTIONS: { value: RoutineCadenceType; label: string; hasInterval: boolean; hasTime: boolean }[] = [
  { value: "every_n_minutes", label: "Every N minutes", hasInterval: true, hasTime: false },
  { value: "every_n_hours", label: "Every N hours", hasInterval: true, hasTime: false },
  { value: "daily", label: "Daily", hasInterval: false, hasTime: true },
  { value: "weekdays", label: "Weekdays", hasInterval: false, hasTime: true },
  { value: "weekly", label: "Weekly", hasInterval: false, hasTime: true },
  { value: "monthly", label: "Monthly", hasInterval: false, hasTime: true },
  { value: "every_n_days", label: "Every N days", hasInterval: true, hasTime: true },
];

export const SUB_DAILY_PRESETS: { label: string; cadence_type: RoutineCadenceType; interval_n: number }[] = [
  { label: "Every 15 minutes", cadence_type: "every_n_minutes", interval_n: 15 },
  { label: "Every 30 minutes", cadence_type: "every_n_minutes", interval_n: 30 },
  { label: "Hourly", cadence_type: "every_n_hours", interval_n: 1 },
  { label: "Every 6 hours", cadence_type: "every_n_hours", interval_n: 6 },
];

export const CONDITION_LABELS: Record<RoutineCondition, string> = {
  created: "is created",
  changed_to: "changes to",
  changed_from: "changes from",
  any_change: "changes (any)",
};

export const ENTITY_TYPE_LABELS: Record<RoutineEntityType, string> = {
  contact: "Contact",
  collection_record: "Collection record",
  knowledge_item: "Knowledge item",
  task: "Task",
};

export const DAYS_OF_WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
