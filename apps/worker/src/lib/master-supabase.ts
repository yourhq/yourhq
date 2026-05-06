import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getMasterSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.MASTER_SUPABASE_URL;
  const key = process.env.MASTER_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("MASTER_SUPABASE_URL and MASTER_SUPABASE_SERVICE_ROLE_KEY are required");
  }

  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export interface HostedUser {
  id: string;
  email: string;
  display_name: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface HostedWorkspace {
  id: string;
  user_id: string;
  label: string;
  emoji: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  supabase_project_ref: string | null;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  supabase_service_role_key_enc: string | null;
  supabase_db_password_enc: string | null;
  e2b_sandbox_id: string | null;
  e2b_sandbox_status: string;
  e2b_access_token: string | null;
  novnc_url: string | null;
  vnc_password_enc: string | null;
  setup_metadata: Record<string, unknown> & {
    ownerName?: string;
    contextPreset?: string;
    onboardingComplete?: boolean;
  };
  provision_stage: string | null;
  provision_error: string | null;
  provision_attempts: number;
  last_provision_attempt_at: string | null;
  auto_login_url?: string | null;
  cancel_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function findUserByEmail(email: string): Promise<HostedUser | null> {
  const db = getMasterSupabase();
  const { data } = await db
    .from("hosted_users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();
  return data as HostedUser | null;
}

export async function getUser(id: string): Promise<HostedUser | null> {
  const db = getMasterSupabase();
  const { data } = await db
    .from("hosted_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as HostedUser | null;
}

export async function createUser(email: string, displayName?: string): Promise<HostedUser> {
  const db = getMasterSupabase();
  const { data, error } = await db
    .from("hosted_users")
    .insert({ email: email.toLowerCase().trim(), display_name: displayName ?? null })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create user");
  return data as HostedUser;
}

export async function getWorkspace(id: string): Promise<HostedWorkspace | null> {
  const db = getMasterSupabase();
  const { data } = await db
    .from("hosted_workspaces")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data as HostedWorkspace | null;
}

export async function getWorkspacesForUser(userId: string): Promise<HostedWorkspace[]> {
  const db = getMasterSupabase();
  const { data } = await db
    .from("hosted_workspaces")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []) as HostedWorkspace[];
}

export async function updateWorkspace(
  id: string,
  fields: Partial<HostedWorkspace> & Record<string, unknown>,
): Promise<void> {
  const db = getMasterSupabase();
  const { error } = await db
    .from("hosted_workspaces")
    .update(fields)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function logSandboxEvent(
  workspaceId: string,
  event: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const db = getMasterSupabase();
  await db.from("sandbox_events").insert({
    workspace_id: workspaceId,
    event,
    metadata: metadata ?? {},
  });
}
