export type CollectionFieldType =
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "select"
  | "multi_select"
  | "url"
  | "email"
  | "phone"
  | "relation"
  | "rich_text";

export type CollectionViewType = "table" | "kanban" | "calendar";

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
}

export interface FieldOptions {
  choices?: SelectOption[];
}

export interface CollectionDefinition {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  meta: Record<string, unknown>;
  archived_at: string | null;
  fields?: CollectionField[];
  record_count?: number;
}

export interface CollectionField {
  id: string;
  created_at: string;
  updated_at: string;
  collection_id: string;
  field_key: string;
  field_type: CollectionFieldType;
  label: string;
  description: string | null;
  sort_order: number;
  required: boolean;
  options: FieldOptions | null;
  default_value: unknown;
  is_title_field: boolean;
  is_active: boolean;
}

export interface CollectionRecord {
  id: string;
  created_at: string;
  updated_at: string;
  collection_id: string;
  values: Record<string, unknown>;
  sort_order: number;
  archived_at: string | null;
}

export interface CollectionView {
  id: string;
  created_at: string;
  updated_at: string;
  collection_id: string;
  name: string;
  view_type: CollectionViewType;
  config: ViewConfig;
  is_default: boolean;
  sort_order: number;
}

export interface ViewConfig {
  group_by_field?: string;
  date_field?: string;
  sort_field?: string;
  sort_direction?: "asc" | "desc";
  hidden_fields?: string[];
  field_widths?: Record<string, number>;
}

export interface CollectionTemplate {
  id: string;
  created_at: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  definition: TemplateDefinition;
  sort_order: number;
}

export interface TemplateDefinition {
  fields: Omit<CollectionField, "id" | "created_at" | "updated_at" | "collection_id" | "is_active" | "description">[];
  views: { name: string; view_type: CollectionViewType; is_default?: boolean; config: ViewConfig }[];
}

// Constants

export const FIELD_TYPE_LABELS: Record<CollectionFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  datetime: "Date & Time",
  boolean: "Checkbox",
  select: "Select",
  multi_select: "Multi Select",
  url: "URL",
  email: "Email",
  phone: "Phone",
  relation: "Relation",
  rich_text: "Rich Text",
};

export const FIELD_TYPE_ICONS: Record<CollectionFieldType, string> = {
  text: "type",
  number: "hash",
  date: "calendar",
  datetime: "clock",
  boolean: "check-square",
  select: "list",
  multi_select: "tags",
  url: "link",
  email: "mail",
  phone: "phone",
  relation: "link-2",
  rich_text: "file-text",
};

export const VIEW_TYPE_LABELS: Record<CollectionViewType, string> = {
  table: "Table",
  kanban: "Board",
  calendar: "Calendar",
};

export const VIEW_TYPE_ICONS: Record<CollectionViewType, string> = {
  table: "table",
  kanban: "columns",
  calendar: "calendar",
};

export const DEFAULT_COLLECTION_COLOR = "#6b7280";
