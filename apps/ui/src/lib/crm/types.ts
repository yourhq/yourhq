// CRM Types — mirrors Supabase schema.
// Workstream-specific fields live in the `extended` JSONB column, shaped at
// runtime by `field_definitions`. Pipeline stages come from `pipeline_stages`.

export interface Contact {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  website_url: string | null;
  company: string | null;
  title: string | null;
  location: string | null;
  avatar_url: string | null;
  how_we_met: string | null;
  notes: string | null;
  tags: string[];
  status: string; // pipeline stage key — validated against pipeline_stages
  status_changed_at: string | null;
  priority: string | null; // 'urgent' | 'high' | 'medium' | 'low' | null
  relationship_strength: string; // 'stranger' | 'acquaintance' | 'warm' | 'strong'
  last_contact_date: string | null;
  source: string | null;
  extended: Record<string, unknown>; // dynamic fields, shaped by field_definitions
  archived_at: string | null;
  campaign_id: string | null;
  // Joined
  campaign?: Campaign | null;
}

export const PRIORITIES: { value: string; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-blue-400",
};

export const RELATIONSHIP_STRENGTHS: { value: string; label: string }[] = [
  { value: "stranger", label: "Stranger" },
  { value: "acquaintance", label: "Acquaintance" },
  { value: "warm", label: "Warm" },
  { value: "strong", label: "Strong" },
];

// ── Templates ──────────────────────────────────────────────────────

export interface Template {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  channel: string | null;
  stage: string | null;
  subject: string | null;
  body: string;
  is_active: boolean;
  use_count: number;
  family: string | null;
  angle: string | null;
  audience: string | null;
  overlays: Record<string, unknown>[];
  meta: Record<string, unknown>;
}

// ── Campaigns ──────────────────────────────────────────────────────

export interface Campaign {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  description: string | null;
  channel: string | null;
  is_active: boolean;
  meta: Record<string, unknown>;
  // Computed
  contact_count?: number;
}

// ── Tags ───────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

// ── Draft Sets ─────────────────────────────────────────────────────
// Channel and stage are free text so any workstream's values can be used.

export type DraftStatus = "draft" | "refining" | "approved" | "superseded";

export interface DraftVariant {
  subject?: string;
  body: string;
  angle: string;
  index: number;
  notes?: string;
}

export interface DraftSet {
  id: string;
  created_at: string;
  updated_at: string;
  contact_id: string;
  template_id: string | null;
  channel: string;
  stage: string;
  version: number;
  variants: DraftVariant[];
  selected_variant_index: 1 | 2 | 3 | null;
  based_on_draft_set_id: string | null;
  feedback_notes: string | null;
  status: DraftStatus;
  meta: Record<string, unknown>;
}

export const DRAFT_STATUS_COLORS: Record<DraftStatus, string> = {
  draft: "bg-yellow-500/20 text-yellow-400",
  refining: "bg-blue-500/20 text-blue-400",
  approved: "bg-green-500/20 text-green-400",
  superseded: "bg-zinc-500/20 text-zinc-400",
};
