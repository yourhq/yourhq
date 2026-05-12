import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readActiveWorkspacePublic } from "@/lib/workspaces/server";

export async function createClient() {
  const workspace = await readActiveWorkspacePublic();
  if (!workspace) {
    throw new Error(
      "No database connection configured. " +
        "Complete onboarding at /onboarding first.",
    );
  }

  const cookieStore = await cookies();
  const cookiePrefix = `hq-${workspace.id.slice(0, 8)}`;

  return createServerClient(workspace.url, workspace.anonKey, {
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
          // setAll called from a Server Component — safe to ignore.
        }
      },
    },
  });
}
