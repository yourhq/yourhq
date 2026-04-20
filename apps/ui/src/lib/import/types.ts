// Import wizard types

import type { FieldDefinition, PipelineStage } from "@/lib/fields/types";

export type ImportEntityType = "contact" | "organization";
export type ImportStep = "upload" | "map" | "preview" | "import";
export type DuplicateStrategy = "skip" | "overwrite" | "create_new";

export interface ColumnMapping {
  sourceColumn: string;
  destinationField: string | null; // null = skip
  isCustomField: boolean;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidatedRow {
  index: number;
  data: Record<string, unknown>;
  errors: ValidationError[];
  isValid: boolean; // no severity=error items
}

export interface ImportResult {
  created: number;
  skipped: number;
  errored: number;
  duplicates: number;
  errors: { row: number; message: string }[];
}

export interface ImportContext {
  entityType: ImportEntityType;
  fieldDefinitions: FieldDefinition[];
  stages: PipelineStage[];
  defaultStageKey: string | null;
}

/** Core fields available for mapping per entity type */
export const CONTACT_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "linkedin_url", label: "LinkedIn URL" },
  { key: "twitter_url", label: "Twitter URL" },
  { key: "website_url", label: "Website URL" },
  { key: "location", label: "Location" },
  { key: "source", label: "Source" },
  { key: "how_we_met", label: "How we met" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Tags" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "relationship_strength", label: "Relationship strength" },
  { key: "last_contact_date", label: "Last contact date" },
];

export const ORGANIZATION_FIELDS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "website", label: "Website" },
  { key: "industry", label: "Industry" },
  { key: "size", label: "Size" },
  { key: "location", label: "Location" },
  { key: "description", label: "Description" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Tags" },
  { key: "status", label: "Status" },
];
