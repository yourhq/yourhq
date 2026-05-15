// Audit Log Types — mirrors Supabase schema

import type { ActorType } from "@/lib/tasks/types";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "archived"
  | "status_changed"
  | "assigned"
  | "commented"
  | "uploaded"
  | "moved"
  | "restored";

export type AuditModule =
  | "crm"
  | "tasks"
  | "agents"
  | "knowledge"
  | "routines"
  | "collections"
  | "sources"
  | "settings"
  | "entity_links";

export interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_type: ActorType;
  actor_agent_id: string | null;
  module: AuditModule;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  summary: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  meta: Record<string, unknown>;
  // Joined
  actor_agent?: { id: string; name: string; slug: string; avatar_url: string | null } | null;
}

// Constants

export const AUDIT_ACTIONS: { value: AuditAction; label: string; icon: string }[] = [
  { value: "created", label: "Created", icon: "plus" },
  { value: "updated", label: "Updated", icon: "pencil" },
  { value: "deleted", label: "Deleted", icon: "trash-2" },
  { value: "archived", label: "Archived", icon: "archive" },
  { value: "status_changed", label: "Status Changed", icon: "arrow-right" },
  { value: "assigned", label: "Assigned", icon: "user-plus" },
  { value: "commented", label: "Commented", icon: "message-square" },
  { value: "uploaded", label: "Uploaded", icon: "upload" },
  { value: "moved", label: "Moved", icon: "move" },
  { value: "restored", label: "Restored", icon: "rotate-ccw" },
];

export const MODULE_LABELS: Record<AuditModule, string> = {
  crm: "CRM",
  tasks: "Tasks",
  agents: "Agents",
  knowledge: "Knowledge",
  routines: "Routines",
  collections: "Collections",
  sources: "Sources",
  settings: "Settings",
  entity_links: "Entity Links",
};

export const MODULE_COLORS: Record<AuditModule, string> = {
  crm: "bg-accent-blue/20 text-accent-blue",
  tasks: "bg-accent-purple/20 text-accent-purple",
  agents: "bg-accent-emerald/20 text-accent-emerald",
  knowledge: "bg-accent-cyan/20 text-accent-cyan",
  routines: "bg-accent-violet/20 text-accent-violet",
  collections: "bg-accent-pink/20 text-accent-pink",
  sources: "bg-accent-teal/20 text-accent-teal",
  settings: "bg-accent-slate/20 text-accent-slate",
  entity_links: "bg-accent-indigo/20 text-accent-indigo",
};
