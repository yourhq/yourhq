// Subset of apps/ui/src/lib/setup/templates.ts — just the data the provisioner
// needs to call complete_setup() in the tenant Supabase. Kept as a standalone
// file so the worker doesn't import from the Next.js app.

export interface ContextPreset {
  key: string;
  pipelineKey: string;
  fieldKey: string;
  streamNames: string[];
  modules: { crm: boolean };
}

export const CONTEXT_PRESETS: ContextPreset[] = [
  { key: "growth", pipelineKey: "outreach", fieldKey: "creator-outreach", streamNames: ["Operations", "Marketing", "Content"], modules: { crm: true } },
  { key: "sales", pipelineKey: "sales", fieldKey: "sales", streamNames: ["Operations", "Marketing"], modules: { crm: true } },
  { key: "recruiting", pipelineKey: "recruiting", fieldKey: "recruiting", streamNames: ["Operations"], modules: { crm: true } },
  { key: "clients", pipelineKey: "clients", fieldKey: "clients", streamNames: ["Operations", "Content"], modules: { crm: true } },
  { key: "personal", pipelineKey: "personal", fieldKey: "personal", streamNames: ["Operations"], modules: { crm: false } },
  { key: "other", pipelineKey: "custom", fieldKey: "blank", streamNames: ["Operations"], modules: { crm: true } },
];

export interface PipelineStage {
  stage_key: string;
  label: string;
  color: string;
  sort_order: number;
  is_terminal: boolean;
  is_default: boolean;
}

export const PIPELINE_TEMPLATES: Record<string, PipelineStage[]> = {
  outreach: [
    { stage_key: "identified", label: "Identified", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
    { stage_key: "researched", label: "Researched", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
    { stage_key: "contacted", label: "Contacted", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
    { stage_key: "replied", label: "Replied", color: "#f59e0b", sort_order: 3, is_terminal: false, is_default: false },
    { stage_key: "active", label: "Active", color: "#22c55e", sort_order: 4, is_terminal: true, is_default: false },
  ],
  sales: [
    { stage_key: "lead", label: "Lead", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
    { stage_key: "qualified", label: "Qualified", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
    { stage_key: "proposal", label: "Proposal", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
    { stage_key: "negotiation", label: "Negotiation", color: "#f59e0b", sort_order: 3, is_terminal: false, is_default: false },
    { stage_key: "won", label: "Won", color: "#22c55e", sort_order: 4, is_terminal: true, is_default: false },
    { stage_key: "lost", label: "Lost", color: "#ef4444", sort_order: 5, is_terminal: true, is_default: false },
  ],
  recruiting: [
    { stage_key: "sourced", label: "Sourced", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
    { stage_key: "screened", label: "Screened", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
    { stage_key: "interview", label: "Interview", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
    { stage_key: "offer", label: "Offer", color: "#f59e0b", sort_order: 3, is_terminal: false, is_default: false },
    { stage_key: "hired", label: "Hired", color: "#22c55e", sort_order: 4, is_terminal: true, is_default: false },
    { stage_key: "rejected", label: "Rejected", color: "#ef4444", sort_order: 5, is_terminal: true, is_default: false },
  ],
  clients: [
    { stage_key: "prospect", label: "Prospect", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
    { stage_key: "pitched", label: "Pitched", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
    { stage_key: "onboarding", label: "Onboarding", color: "#8b5cf6", sort_order: 2, is_terminal: false, is_default: false },
    { stage_key: "active", label: "Active", color: "#22c55e", sort_order: 3, is_terminal: true, is_default: false },
    { stage_key: "paused", label: "Paused", color: "#f59e0b", sort_order: 4, is_terminal: false, is_default: false },
  ],
  personal: [
    { stage_key: "new", label: "New", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
    { stage_key: "known", label: "Known", color: "#3b82f6", sort_order: 1, is_terminal: false, is_default: false },
    { stage_key: "close", label: "Close", color: "#22c55e", sort_order: 2, is_terminal: true, is_default: false },
  ],
  custom: [
    { stage_key: "new", label: "New", color: "#6b7280", sort_order: 0, is_terminal: false, is_default: true },
    { stage_key: "done", label: "Done", color: "#22c55e", sort_order: 1, is_terminal: true, is_default: false },
  ],
};

export interface FieldDef {
  field_key: string;
  field_type: string;
  label: string;
  field_group: string;
  sort_order: number;
  required: boolean;
  options: string[] | null;
  description: string | null;
}

export const FIELD_TEMPLATES: Record<string, FieldDef[]> = {
  "creator-outreach": [
    { field_key: "subscriber_count", field_type: "number", label: "Subscriber count", field_group: "outreach", sort_order: 0, required: false, options: null, description: null },
    { field_key: "content_style", field_type: "select", label: "Content style", field_group: "outreach", sort_order: 1, required: false, options: ["Educational", "Entertainment", "News", "Tutorial", "Review"], description: null },
    { field_key: "platform", field_type: "select", label: "Platform", field_group: "outreach", sort_order: 2, required: false, options: ["YouTube", "TikTok", "Instagram", "Twitter", "LinkedIn", "Newsletter"], description: null },
    { field_key: "hook_angle", field_type: "text", label: "Hook angle", field_group: "outreach", sort_order: 3, required: false, options: null, description: "What angle to pitch them on" },
    { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "outreach", sort_order: 4, required: false, options: null, description: null },
  ],
  sales: [
    { field_key: "company", field_type: "text", label: "Company", field_group: "sales", sort_order: 0, required: false, options: null, description: null },
    { field_key: "deal_value", field_type: "number", label: "Deal value ($)", field_group: "sales", sort_order: 1, required: false, options: null, description: null },
    { field_key: "close_date", field_type: "date", label: "Expected close", field_group: "sales", sort_order: 2, required: false, options: null, description: null },
    { field_key: "source", field_type: "select", label: "Source", field_group: "sales", sort_order: 3, required: false, options: ["Inbound", "Referral", "Cold outreach", "Event", "Partner"], description: null },
    { field_key: "next_step", field_type: "text", label: "Next step", field_group: "sales", sort_order: 4, required: false, options: null, description: null },
    { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "sales", sort_order: 5, required: false, options: null, description: null },
  ],
  recruiting: [
    { field_key: "role", field_type: "text", label: "Role", field_group: "recruiting", sort_order: 0, required: false, options: null, description: null },
    { field_key: "location", field_type: "text", label: "Location", field_group: "recruiting", sort_order: 1, required: false, options: null, description: null },
    { field_key: "years_experience", field_type: "number", label: "Years experience", field_group: "recruiting", sort_order: 2, required: false, options: null, description: null },
    { field_key: "seniority", field_type: "select", label: "Seniority", field_group: "recruiting", sort_order: 3, required: false, options: ["Junior", "Mid", "Senior", "Staff", "Principal"], description: null },
    { field_key: "resume_url", field_type: "url", label: "Resume URL", field_group: "recruiting", sort_order: 4, required: false, options: null, description: null },
    { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "recruiting", sort_order: 5, required: false, options: null, description: null },
  ],
  clients: [
    { field_key: "company", field_type: "text", label: "Company", field_group: "client", sort_order: 0, required: false, options: null, description: null },
    { field_key: "engagement_type", field_type: "select", label: "Engagement type", field_group: "client", sort_order: 1, required: false, options: ["Retainer", "Project", "Hourly", "One-off"], description: null },
    { field_key: "start_date", field_type: "date", label: "Start date", field_group: "client", sort_order: 2, required: false, options: null, description: null },
    { field_key: "mrr", field_type: "number", label: "Monthly value ($)", field_group: "client", sort_order: 3, required: false, options: null, description: null },
    { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "client", sort_order: 4, required: false, options: null, description: null },
  ],
  personal: [
    { field_key: "how_we_met", field_type: "text", label: "How we met", field_group: "personal", sort_order: 0, required: false, options: null, description: null },
    { field_key: "birthday", field_type: "date", label: "Birthday", field_group: "personal", sort_order: 1, required: false, options: null, description: null },
    { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "personal", sort_order: 2, required: false, options: null, description: null },
  ],
  blank: [
    { field_key: "notes", field_type: "textarea", label: "Notes", field_group: "general", sort_order: 0, required: false, options: null, description: null },
  ],
};

export interface StreamDef {
  name: string;
  description: string | null;
  type: string;
  color: string;
  icon: string | null;
  sort_order: number;
}

const ALL_STREAMS: Record<string, StreamDef> = {
  Operations: { name: "Operations", description: "Day-to-day ops and admin tasks.", type: "functional", color: "#6b7280", icon: null, sort_order: 0 },
  Marketing: { name: "Marketing", description: "Campaigns, content, and outreach.", type: "functional", color: "#3b82f6", icon: null, sort_order: 1 },
  Content: { name: "Content", description: "Content creation and publishing.", type: "functional", color: "#22c55e", icon: null, sort_order: 2 },
};

export function resolvePreset(presetKey: string) {
  const preset = CONTEXT_PRESETS.find((p) => p.key === presetKey) ?? CONTEXT_PRESETS[CONTEXT_PRESETS.length - 1];
  const stages = PIPELINE_TEMPLATES[preset.pipelineKey] ?? PIPELINE_TEMPLATES.custom;
  const fields = FIELD_TEMPLATES[preset.fieldKey] ?? FIELD_TEMPLATES.blank;
  const streams = preset.streamNames
    .map((name, i) => {
      const base = ALL_STREAMS[name];
      if (base) return { ...base, sort_order: i };
      return { name, description: null, type: "custom", color: "#6b7280", icon: null, sort_order: i };
    });

  return { stages, fields, streams, modules: preset.modules };
}
