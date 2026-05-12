// Notifications — lightweight queue for follow-up reminders, agent suggestions, etc.

export type NotificationType =
  | "follow_up"
  | "stale_contact"
  | "agent_suggestion"
  | "agent_comment"
  | "task_reminder"
  | "task_assigned"
  | "task_completed"
  | "task_blocked"
  | "task_overdue"
  | "deliverable_submitted"
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
  agent_comment: "Agent comment",
  task_reminder: "Task reminder",
  task_assigned: "Task assigned",
  task_completed: "Task completed",
  task_blocked: "Task blocked",
  task_overdue: "Task overdue",
  deliverable_submitted: "Deliverable",
  system: "System",
  "budget.warned": "Budget warning",
  "budget.exceeded": "Budget exceeded",
};
