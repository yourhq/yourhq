// Interactions — replaces OutreachLogEntry. Generic touchpoint records.

export type InteractionType =
  | "email"
  | "call"
  | "meeting"
  | "linkedin_message"
  | "dm"
  | "intro"
  | "coffee"
  | "event"
  | "note"
  | "other";

export type InteractionDirection = "inbound" | "outbound";

export interface Interaction {
  id: string;
  created_at: string;
  contact_id: string | null;
  org_id: string | null;
  type: string;
  direction: string | null;
  channel: string | null;
  subject: string | null;
  summary: string | null;
  body: string | null;
  occurred_at: string;
  next_action: string | null;
  next_action_date: string | null;
  template_id: string | null;
  actor_type: "human" | "agent" | "system";
  actor_agent_id: string | null;
  meta: Record<string, unknown>;
}

export const INTERACTION_TYPES: { value: InteractionType; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "linkedin_message", label: "LinkedIn message" },
  { value: "dm", label: "Direct message" },
  { value: "intro", label: "Intro" },
  { value: "coffee", label: "Coffee" },
  { value: "event", label: "Event" },
  { value: "note", label: "Note" },
  { value: "other", label: "Other" },
];

export const INTERACTION_DIRECTIONS: {
  value: InteractionDirection;
  label: string;
}[] = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
];
