export type OwnerType = "task" | "routine" | "collection_record" | "agent";

export type TargetType =
  | "knowledge_item"
  | "collection_record"
  | "contact"
  | "organization"
  | "task"
  | "url";

export interface EntityLink {
  id: string;
  created_at: string;
  owner_type: OwnerType;
  owner_id: string;
  target_type: TargetType;
  target_id: string | null;
  url: string | null;
  label: string | null;
  sort_order: number;
  meta: Record<string, unknown>;
  resolved_name?: string;
  resolved_icon?: string;
  resolved_extra?: Record<string, unknown>;
}

export interface EntityLinkSearchResult {
  id: string;
  name: string;
  target_type: TargetType;
  icon?: string;
  extra?: Record<string, unknown>;
}

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  knowledge_item: "Knowledge",
  collection_record: "Collection Record",
  contact: "Contact",
  organization: "Organization",
  task: "Task",
  url: "URL",
};
