// Field definitions and pipeline stages — runtime-configured via Settings UI.
// Replaces hardcoded enums (OUTREACH_STATUSES, CHANNELS, TIERS, etc.).

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

// Field type options for the Settings UI.
export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
  { value: "url", label: "URL" },
  { value: "select", label: "Select" },
  { value: "multiselect", label: "Multi-select" },
  { value: "date", label: "Date" },
];
