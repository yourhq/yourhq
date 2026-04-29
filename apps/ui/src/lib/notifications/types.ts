// Notifications — lightweight queue for follow-up reminders, agent suggestions, etc.

export type NotificationType =
  | "follow_up"
  | "stale_contact"
  | "agent_suggestion"
  | "task_reminder"
  | "system"
  | "budget.warned"
  | "budget.exceeded";

export interface Notification {
  id: string;
  created_at: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  actor_type: "human" | "agent" | "system";
  actor_agent_id: string | null;
  is_read: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  meta: Record<string, unknown>;
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  follow_up: "Follow-up",
  stale_contact: "Stale contact",
  agent_suggestion: "Agent suggestion",
  task_reminder: "Task reminder",
  system: "System",
  "budget.warned": "Budget warning",
  "budget.exceeded": "Budget exceeded",
};
