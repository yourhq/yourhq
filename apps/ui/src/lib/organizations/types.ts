// Organizations — companies, agencies, firms, communities.

export interface Organization {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  type: string | null;
  website: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  status: string | null;
  extended: Record<string, unknown>;
  archived_at: string | null;
  // Computed / joined
  contact_count?: number;
}

export interface ContactOrganization {
  id: string;
  created_at: string;
  contact_id: string;
  org_id: string;
  role: string | null;
  is_current: boolean;
  started_at: string | null;
  ended_at: string | null;
  // Joined
  organization?: Organization | null;
}

export const ORG_TYPES: { value: string; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "agency", label: "Agency" },
  { value: "vc_firm", label: "VC firm" },
  { value: "community", label: "Community" },
  { value: "recruiting_firm", label: "Recruiting firm" },
  { value: "other", label: "Other" },
];

export const ORG_SIZES: { value: string; label: string }[] = [
  { value: "1-10", label: "1–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "201-1000", label: "201–1000" },
  { value: "1000+", label: "1000+" },
];
