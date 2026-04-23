import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readActiveProjectPublic } from "@/lib/projects/server";

/**
 * Server-side Supabase factory. Looks up the active project from the
 * registry (via the hq_active_project cookie), then creates a
 * cookie-aware Supabase client with the project's URL + anon key.
 *
 * Throws if no project is configured yet. Callers inside the dashboard
 * shouldn't hit this — middleware redirects to /onboarding before any
 * dashboard page loads. The throw surfaces bugs clearly.
 *
 * Uses the ANON key (not service role) — user's session cookies determine
 * their access. If you need to bypass RLS, use a separate helper that
 * reads from the secrets file (intentionally not in this module).
 */
export async function createClient() {
  const project = await readActiveProjectPublic();
  if (!project) {
    throw new Error(
      "No Supabase project is configured. " +
        "Complete onboarding at /onboarding first.",
    );
  }

  const cookieStore = await cookies();

  // Match the per-project cookie prefix used by the browser + middleware.
  // See lib/supabase/client.ts#cookieNameFor.
  const cookiePrefix = `hq-${project.id.slice(0, 8)}`;

  return createServerClient(project.url, project.anonKey, {
    cookieOptions: { name: cookiePrefix },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll called from a Server Component. Safe to ignore when
          // middleware is refreshing sessions.
        }
      },
    },
  });
}
