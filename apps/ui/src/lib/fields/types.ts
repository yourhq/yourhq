import {
  Type,
  AlignLeft,
  Hash,
  ToggleLeft,
  Link,
  ChevronDown,
  Tags,
  Calendar,
  type LucideIcon,
} from "lucide-react";

export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "url"
  | "select"
  | "multiselect"
  | "date"
  | "textarea";

export interface FieldDefinition {
  id: string;
  created_at: string;
  entity_type: string; // 'contact' | 'organization' | string
  field_key: string;
  field_type: FieldType;
  label: string;
  field_group: string | null;
  sort_order: number;
  required: boolean;
  options: string[] | null;
  description: string | null;
  is_active: boolean;
}

export interface PipelineStage {
  id: string;
  created_at: string;
  entity_type: string;
  stage_key: string;
  label: string;
  color: string | null;
  sort_order: number;
  is_terminal: boolean;
  is_default: boolean;
}

// Default fallback color for stages that don't have one set.
export const DEFAULT_STAGE_COLOR = "#6b7280";

export const FIELD_TYPE_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  boolean: ToggleLeft,
  url: Link,
  select: ChevronDown,
  multiselect: Tags,
  date: Calendar,
};

export const FIELD_TYPES: { value: FieldType; label: string; icon: LucideIcon }[] = [
  { value: "text", label: "Text", icon: Type },
  { value: "textarea", label: "Long text", icon: AlignLeft },
  { value: "number", label: "Number", icon: Hash },
  { value: "boolean", label: "Yes / No", icon: ToggleLeft },
  { value: "url", label: "URL", icon: Link },
  { value: "select", label: "Select", icon: ChevronDown },
  { value: "multiselect", label: "Multi-select", icon: Tags },
  { value: "date", label: "Date", icon: Calendar },
];

export const STAGE_COLORS = [
  "#6b7280", "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899",
];
