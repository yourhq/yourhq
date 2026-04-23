import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { readActiveProjectWithSecrets } from "@/lib/projects/server";

/**
 * ADMIN Supabase client — uses the service role key, bypasses RLS.
 *
 * Use this only when you truly need elevated privileges:
 *   - Enqueuing an agent_command before a user session exists
 *   - Writing audit_log rows
 *   - Cross-workspace reads (we don't do this today)
 *
 * NEVER return the result of a query using this client directly to the
 * browser without auth-gating the calling handler. Treat it like `sudo`.
 */
export async function createAdminClient() {
  const project = await readActiveProjectWithSecrets();
  if (!project) {
    throw new Error(
      "No Supabase project is configured. " +
        "Complete onboarding at /onboarding first.",
    );
  }

  return createSupabaseClient(project.url, project.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
