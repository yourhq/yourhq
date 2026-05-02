// Inbox Types — mirrors Supabase schema

import type { ActorType } from "@/lib/tasks/types";

export type InboxItemStatus = "pending" | "leased" | "done" | "failed" | "dead_letter";

export type InboxEventType =
  | "task_assignment"
  | "task_reassignment"
  | "task_comment_mention"
  | "contact_created"
  | "contact_status_changed"
  | "contact_updated"
  | "routine_schedule"
  | "routine_event";

export interface InboxItem {
  id: string;
  created_at: string;
  updated_at: string;
  agent_id: string;
  agent_slug: string;
  event_type: InboxEventType;
  task_id: string | null;
  comment_id: string | null;
  contact_id: string | null;
  status: InboxItemStatus;
  leased_at: string | null;
  leased_until: string | null;
  completed_at: string | null;
  failed_at: string | null;
  attempt_count: number;
  max_attempts: number;
  summary: string | null;
  context: Record<string, unknown>;
  last_wake_attempt_at: string | null;
  last_wake_success_at: string | null;
  dedup_key: string;
  // Joined
  agent?: { id: string; name: string; slug: string } | null;
  contact?: { id: string; name: string; handle: string | null } | null;
}

// Constants

export const INBOX_STATUSES: { value: InboxItemStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "leased", label: "Leased" },
  { value: "done", label: "Done" },
  { value: "failed", label: "Failed" },
  { value: "dead_letter", label: "Dead Letter" },
];

export const INBOX_STATUS_COLORS: Record<InboxItemStatus, string> = {
  pending: "#3b82f6",
  leased: "#f59e0b",
  done: "#22c55e",
  failed: "#ef4444",
  dead_letter: "#dc2626",
};

export const INBOX_STATUS_BG: Record<InboxItemStatus, string> = {
  pending: "bg-blue-500/20 text-blue-400",
  leased: "bg-amber-500/20 text-amber-400",
  done: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  dead_letter: "bg-red-500/20 text-red-300",
};
