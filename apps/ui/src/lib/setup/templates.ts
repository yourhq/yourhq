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
    key: "sales",
    label: "Sales Pipeline",
    description: "Move deals from first touch through close.",
    icon: "💸",
    stages: [
      { stage_key: "lead", label: "Lead", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "qualified", label: "Qualified", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
      { stage_key: "proposal", label: "Proposal", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
      { stage_key: "negotiation", label: "Negotiation", color: "#f59e0b", sort_order: 3, is_terminal: false, is_default: false },
      { stage_key: "won", label: "Won", color: "#22c55e", sort_order: 4, is_terminal: true, is_default: false },
      { stage_key: "lost", label: "Lost", color: "#ef4444", sort_order: 5, is_terminal: true, is_default: false },
    ],
  },
  {
    key: "recruiting",
    label: "Recruiting",
    description: "Source, interview, and hire candidates.",
    icon: "🧑‍💼",
    stages: [
      { stage_key: "sourced", label: "Sourced", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "screened", label: "Screened", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
      { stage_key: "interview", label: "Interview", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
      { stage_key: "offer", label: "Offer", color: "#f59e0b", sort_order: 3, is_terminal: false, is_default: false },
      { stage_key: "hired", label: "Hired", color: "#22c55e", sort_order: 4, is_terminal: true, is_default: false },
      { stage_key: "rejected", label: "Rejected", color: "#ef4444", sort_order: 5, is_terminal: true, is_default: false },
    ],
  },
  {
    key: "clients",
    label: "Client Accounts",
    description: "Track clients from prospect to active engagement.",
    icon: "🤝",
    stages: [
      { stage_key: "prospect", label: "Prospect", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "pitched", label: "Pitched", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
      { stage_key: "onboarding", label: "Onboarding", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
      { stage_key: "active", label: "Active", color: "#22c55e", sort_order: 3, is_terminal: true, is_default: false },
      { stage_key: "paused", label: "Paused", color: "#f59e0b", sort_order: 4, is_terminal: false, is_default: false },
    ],
  },
  {
    key: "personal",
    label: "Personal",
    description: "Track people in your life and their status.",
    icon: "🧭",
    stages: [
      { stage_key: "new", label: "New", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
      { stage_key: "known", label: "Known", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
      { stage_key: "close", label: "Close", color: "#22c55e", sort_order: 2, is_terminal: true, is_default: false },
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
    key: "sales",
    label: "Sales",
    description: "Fields for deal flow, company info, and value.",
    icon: "💸",
    fields: [
      { field_key: "company", field_type: "text", label: "Company", field_group: "sales", sort_order: 0, required: false, options: null, description: null },
      { field_key: "deal_value", field_type: "number", label: "Deal value ($)", field_group: "sales", sort_order: 1, required: false, options: null, description: null },
      { field_key: "close_date", field_type: "date", label: "Expected close", field_group: "sales", sort_order: 2, required: false, options: null, description: null },
      { field_key: "source", field_type: "select", label: "Source", field_group: "sales", sort_order: 3, required: false, options: ["Inbound", "Referral", "Cold outreach", "Event", "Partner"], description: null },
      { field_key: "next_step", field_type: "text", label: "Next step", field_group: "sales", sort_order: 4, required: false, options: null, description: null },
      { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "sales", sort_order: 5, required: false, options: null, description: null },
    ],
  },
  {
    key: "recruiting",
    label: "Recruiting",
    description: "Fields for candidates, roles, and interview tracking.",
    icon: "🧑‍💼",
    fields: [
      { field_key: "role", field_type: "text", label: "Role", field_group: "recruiting", sort_order: 0, required: false, options: null, description: null },
      { field_key: "location", field_type: "text", label: "Location", field_group: "recruiting", sort_order: 1, required: false, options: null, description: null },
      { field_key: "years_experience", field_type: "number", label: "Years experience", field_group: "recruiting", sort_order: 2, required: false, options: null, description: null },
      { field_key: "seniority", field_type: "select", label: "Seniority", field_group: "recruiting", sort_order: 3, required: false, options: ["Junior", "Mid", "Senior", "Staff", "Principal"], description: null },
      { field_key: "resume_url", field_type: "url", label: "Resume URL", field_group: "recruiting", sort_order: 4, required: false, options: null, description: null },
      { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "recruiting", sort_order: 5, required: false, options: null, description: null },
    ],
  },
  {
    key: "clients",
    label: "Clients",
    description: "Fields for client accounts and engagement details.",
    icon: "🤝",
    fields: [
      { field_key: "company", field_type: "text", label: "Company", field_group: "client", sort_order: 0, required: false, options: null, description: null },
      { field_key: "engagement_type", field_type: "select", label: "Engagement type", field_group: "client", sort_order: 1, required: false, options: ["Retainer", "Project", "Hourly", "One-off"], description: null },
      { field_key: "start_date", field_type: "date", label: "Start date", field_group: "client", sort_order: 2, required: false, options: null, description: null },
      { field_key: "mrr", field_type: "number", label: "Monthly value ($)", field_group: "client", sort_order: 3, required: false, options: null, description: null },
      { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "client", sort_order: 4, required: false, options: null, description: null },
    ],
  },
  {
    key: "personal",
    label: "Personal",
    description: "Light-touch fields for personal contacts.",
    icon: "🧭",
    fields: [
      { field_key: "how_we_met", field_type: "text", label: "How we met", field_group: "personal", sort_order: 0, required: false, options: null, description: null },
      { field_key: "birthday", field_type: "date", label: "Birthday", field_group: "personal", sort_order: 1, required: false, options: null, description: null },
      { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "personal", sort_order: 2, required: false, options: null, description: null },
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

/* ------------------------------------------------------------------ */
/*  Context presets                                                   */
/*                                                                    */
/*  The onboarding "What will you use HQ for?" screen shows these as  */
/*  tiles. Each picks a pipeline, field set, and stream list so the   */
/*  user skips the three separate picker screens.                     */
/* ------------------------------------------------------------------ */

export interface WorkspaceModules {
  crm: boolean;
}

export interface ContextPreset {
  key: string;
  label: string;
  description: string;
  emoji: string;
  pipelineKey: string;
  fieldKey: string;
  streamNames: string[];
  modules: WorkspaceModules;
  collectionTemplateSlugs: string[];
}

export const CONTEXT_PRESETS: ContextPreset[] = [
  {
    key: "growth",
    label: "Growth & outreach",
    description: "Cold outreach, content partnerships, creator collabs.",
    emoji: "🚀",
    pipelineKey: "outreach",
    fieldKey: "creator-outreach",
    streamNames: ["Operations", "Marketing", "Content"],
    modules: { crm: true },
    collectionTemplateSlugs: ["content-calendar"],
  },
  {
    key: "sales",
    label: "Sales pipeline",
    description: "Deal flow, follow-ups, proposals, revenue tracking.",
    emoji: "💸",
    pipelineKey: "sales",
    fieldKey: "sales",
    streamNames: ["Operations", "Marketing"],
    modules: { crm: true },
    collectionTemplateSlugs: [],
  },
  {
    key: "recruiting",
    label: "Recruiting",
    description: "Sourcing candidates, interviews, offers, onboarding.",
    emoji: "🧑‍💼",
    pipelineKey: "recruiting",
    fieldKey: "recruiting",
    streamNames: ["Operations"],
    modules: { crm: true },
    collectionTemplateSlugs: [],
  },
  {
    key: "job-search",
    label: "Job search",
    description: "Track applications, interviews, and offers.",
    emoji: "💼",
    pipelineKey: "job-search",
    fieldKey: "job-search",
    streamNames: ["Operations"],
    modules: { crm: false },
    collectionTemplateSlugs: ["job-search"],
  },
  {
    key: "clients",
    label: "Client & consulting work",
    description: "Client accounts, project tracking, deliverables.",
    emoji: "🤝",
    pipelineKey: "clients",
    fieldKey: "clients",
    streamNames: ["Operations", "Content"],
    modules: { crm: true },
    collectionTemplateSlugs: [],
  },
  {
    key: "personal",
    label: "Personal ops",
    description: "Contacts, notes, and life admin.",
    emoji: "🧭",
    pipelineKey: "personal",
    fieldKey: "personal",
    streamNames: ["Operations"],
    modules: { crm: false },
    collectionTemplateSlugs: [],
  },
  {
    key: "other",
    label: "Something else",
    description: "Start blank — customize everything in Settings later.",
    emoji: "✏️",
    pipelineKey: "custom",
    fieldKey: "blank",
    streamNames: ["Operations"],
    modules: { crm: true },
    collectionTemplateSlugs: [],
  },
];

export const DEFAULT_CONTEXT_PRESET: ContextPreset =
  CONTEXT_PRESETS[0];
