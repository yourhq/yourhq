// Workspace — single-row table for app-level settings.

export interface Workspace {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  slug: string | null;
  description: string | null;
  initialized: boolean;
  owner_name: string | null;
  owner_preferred_name: string | null;
  owner_timezone: string | null;
  settings: Record<string, unknown>;
}
