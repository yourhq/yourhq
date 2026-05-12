import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { readActiveWorkspaceWithSecrets } from "@/lib/workspaces/server";

export async function createAdminClient() {
  const workspace = await readActiveWorkspaceWithSecrets();
  if (!workspace) {
    throw new Error(
      "No database connection configured. " +
        "Complete onboarding at /onboarding first.",
    );
  }

  return createSupabaseClient(workspace.url, workspace.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
