// Setup wizard — hardcoded seed templates for pipeline stages, field definitions, and streams.

import type { FieldType } from "@/lib/fields/types";

/* ------------------------------------------------------------------ */
/*  Pipeline stage templates                                          */
/* ------------------------------------------------------------------ */

export interface PipelineTemplateStage {
  stage_key: string;
  label: string;
  color: string;
  sort_order: number;
  is_terminal: boolean;
  is_default: boolean;
}

export interface PipelineTemplate {
  key: string;
  label: string;
  description: string;
  icon: string;
  stages: PipelineTemplateStage[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    key: "outreach",
    label: "Outreach",
    description: "Track contacts from identification through active engagement.",
    icon: "📬",
    stages: [
      { stage_key: "identified", label: "Identified", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "researched", label: "Researched", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
      { stage_key: "contacted", label: "Contacted", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
      { stage_key: "replied", label: "Replied", color: "#f59e0b", sort_order: 3, is_terminal: false, is_default: false },
      { stage_key: "active", label: "Active", color: "#22c55e", sort_order: 4, is_terminal: true, is_default: false },
    ],
  },
  {
    key: "job-search",
    label: "Job Search",
    description: "Follow your pipeline from research to offer acceptance.",
    icon: "💼",
    stages: [
      { stage_key: "researching", label: "Researching", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "applied", label: "Applied", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
      { stage_key: "interviewing", label: "Interviewing", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
      { stage_key: "offer", label: "Offer", color: "#f59e0b", sort_order: 3, is_terminal: false, is_default: false },
      { stage_key: "accepted", label: "Accepted", color: "#22c55e", sort_order: 4, is_terminal: true, is_default: false },
    ],
  },
  {
    key: "networking",
    label: "Networking",
    description: "Build relationships from first contact to active connection.",
    icon: "🤝",
    stages: [
      { stage_key: "identified", label: "Identified", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "connected", label: "Connected", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
      { stage_key: "warm", label: "Warm", color: "#f59e0b", sort_order: 2, is_terminal: false, is_default: false },
      { stage_key: "active_relationship", label: "Active Relationship", color: "#22c55e", sort_order: 3, is_terminal: true, is_default: false },
    ],
  },
  {
    key: "custom",
    label: "Start blank",
    description: "Minimal pipeline — add your own stages in settings later.",
    icon: "✏️",
    stages: [
      { stage_key: "new", label: "New", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "done", label: "Done", color: "#22c55e", sort_order: 1, is_terminal: true, is_default: false },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Field definition templates                                        */
/* ------------------------------------------------------------------ */

export interface FieldTemplateField {
  field_key: string;
  field_type: FieldType;
  label: string;
  field_group: string;
  sort_order: number;
  required: boolean;
  options: string[] | null;
  description: string | null;
}

export interface FieldTemplate {
  key: string;
  label: string;
  description: string;
  icon: string;
  fields: FieldTemplateField[];
}

export const FIELD_TEMPLATES: FieldTemplate[] = [
  {
    key: "creator-outreach",
    label: "Creator Outreach",
    description: "Fields for tracking creator partnerships and outreach.",
    icon: "🎬",
    fields: [
      { field_key: "subscriber_count", field_type: "number", label: "Subscriber count", field_group: "outreach", sort_order: 0, required: false, options: null, description: null },
      { field_key: "content_style", field_type: "select", label: "Content style", field_group: "outreach", sort_order: 1, required: false, options: ["Educational", "Entertainment", "News", "Tutorial", "Review"], description: null },
      { field_key: "platform", field_type: "select", label: "Platform", field_group: "outreach", sort_order: 2, required: false, options: ["YouTube", "TikTok", "Instagram", "Twitter", "LinkedIn", "Newsletter"], description: null },
      { field_key: "hook_angle", field_type: "text", label: "Hook angle", field_group: "outreach", sort_order: 3, required: false, options: null, description: "What angle to pitch them on" },
      { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "outreach", sort_order: 4, required: false, options: null, description: null },
    ],
  },
  {
    key: "job-search",
    label: "Job Search",
    description: "Fields for tracking job applications and interviews.",
    icon: "💼",
    fields: [
      { field_key: "salary_range", field_type: "text", label: "Salary range", field_group: "job", sort_order: 0, required: false, options: null, description: null },
      { field_key: "company_size", field_type: "select", label: "Company size", field_group: "job", sort_order: 1, required: false, options: ["Startup", "SMB", "Mid-market", "Enterprise"], description: null },
      { field_key: "referral_path", field_type: "text", label: "Referral path", field_group: "job", sort_order: 2, required: false, options: null, description: "Who referred you or how you found this" },
      { field_key: "interview_stage", field_type: "select", label: "Interview stage", field_group: "job", sort_order: 3, required: false, options: ["Phone Screen", "Technical", "Behavioral", "Final", "Offer"], description: null },
      { field_key: "job_url", field_type: "url", label: "Job URL", field_group: "job", sort_order: 4, required: false, options: null, description: null },
      { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "job", sort_order: 5, required: false, options: null, description: null },
    ],
  },
  {
    key: "blank",
    label: "Start blank",
    description: "Just a notes field — add your own fields in settings later.",
    icon: "✏️",
    fields: [
      { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "general", sort_order: 0, required: false, options: null, description: null },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Stream templates                                                  */
/* ------------------------------------------------------------------ */

export interface StreamTemplate {
  name: string;
  description: string | null;
  type: "functional" | "project" | "custom";
  color: string;
  icon: string | null;
  sort_order: number;
}

export const DEFAULT_STREAMS: StreamTemplate[] = [
  { name: "Operations", description: "Day-to-day ops and admin tasks.", type: "functional", color: "#6b7280", icon: null, sort_order: 0 },
  { name: "Marketing", description: "Campaigns, content, and outreach.", type: "functional", color: "#3b82f6", icon: null, sort_order: 1 },
  { name: "Content", description: "Content creation and publishing.", type: "functional", color: "#22c55e", icon: null, sort_order: 2 },
];
