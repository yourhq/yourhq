// Supabase credentials validator — used by the onboarding flow and
// the Add Project dialog. Checks:
//
//   1. URL reachable
//   2. Anon key authenticates (not 401/403)
//   3. Service role key authenticates
//   4. `workspace` table exists (migration ran)

export interface ValidateResult {
  ok: boolean;
  error?: string;
  hint?: string;
}

export async function validateSupabaseCreds(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ValidateResult> {
  const base = input.url.replace(/\/$/, "");

  try {
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${input.anonKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Anon key rejected by Supabase.",
        hint: "Double-check the anon key in Supabase → Project Settings → API.",
      };
    }
    if (!res.ok && res.status !== 404) {
      return {
        ok: false,
        error: `Supabase returned ${res.status} for the base URL.`,
        hint: "Verify the project URL is correct and the project is not paused.",
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach ${base}: ${(e as Error).message}`,
      hint: "Check the URL and your network connection.",
    };
  }

  try {
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Service role key rejected by Supabase.",
        hint: "Double-check the service_role secret in Supabase → Project Settings → API.",
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Service role check failed: ${(e as Error).message}`,
    };
  }

  try {
    const res = await fetch(`${base}/rest/v1/workspace?select=id&limit=1`, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    if (res.status === 404) {
      return {
        ok: false,
        error: "The workspace table doesn't exist in this project.",
        hint:
          "Run db/migrations/001_schema.sql in your Supabase SQL editor " +
          "before connecting. See docs/INSTALL.md → Supabase.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `Schema check returned ${res.status}.`,
        hint: "The migration may be incomplete. Re-run db/migrations/001_schema.sql.",
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Schema check failed: ${(e as Error).message}`,
    };
  }

  return { ok: true };
}
