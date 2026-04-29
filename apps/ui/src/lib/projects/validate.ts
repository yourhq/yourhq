// Supabase credentials validator — used by the onboarding flow and
// the Add Project dialog.
//
// Supports both legacy JWT keys (eyJ...) and the new sb_publishable_* /
// sb_secret_* keys that Supabase is migrating to. The validation
// strategy does a single PostgREST probe against the `workspace` table
// using the service role key, which has the nice property of checking
// three things at once:
//
//   - URL reachable
//   - Service role key accepted
//   - Migration ran (workspace table exists)
//
// The anon key isn't exhaustively probed — if it's clearly wrong (too
// short / malformed) we catch that in the schema check; otherwise we
// trust it and let login surface any real failure. This avoids
// false-negative key rejections across the two key formats.

export interface ValidateResult {
  ok: boolean;
  error?: string;
  hint?: string;
}

async function probe(
  url: string,
  key: string,
): Promise<{ status: number; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    return { status: res.status };
  } catch (e) {
    return { status: 0, error: (e as Error).message };
  }
}

function looksLikeValidKey(key: string): boolean {
  // Legacy JWT: "eyJ..." minimum ~100 chars
  // New format: "sb_publishable_*" / "sb_secret_*"
  if (key.startsWith("eyJ") && key.length > 40) return true;
  if (key.startsWith("sb_publishable_") && key.length > 20) return true;
  if (key.startsWith("sb_secret_") && key.length > 20) return true;
  // Something else — give it the benefit of the doubt and let Supabase
  // decide. Returning false would cause false negatives for Supabase
  // variants we haven't seen yet.
  return key.length >= 20;
}

export async function validateSupabaseCreds(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ValidateResult> {
  const base = input.url.replace(/\/$/, "");

  if (!looksLikeValidKey(input.anonKey)) {
    return {
      ok: false,
      error: "Publishable key looks malformed.",
      hint: "Expected an 'sb_publishable_...' or legacy 'eyJ...' JWT.",
    };
  }
  if (!looksLikeValidKey(input.serviceRoleKey)) {
    return {
      ok: false,
      error: "Secret key looks malformed.",
      hint: "Expected an 'sb_secret_...' or legacy 'eyJ...' JWT.",
    };
  }

  // Single combined probe: reach the workspace table with the service role
  // key. Tests URL reachability + service key validity + migration state.
  const schemaEndpoint = `${base}/rest/v1/workspace?select=id&limit=1`;
  const schema = await probe(schemaEndpoint, input.serviceRoleKey);

  if (schema.error) {
    return {
      ok: false,
      error: `Could not reach ${base}: ${schema.error}`,
      hint: "Check the URL and your network connection.",
    };
  }

  if (schema.status === 401 || schema.status === 403) {
    return {
      ok: false,
      error: "Secret key rejected by Supabase.",
      hint: "Double-check the secret key in Supabase → Project Settings → API Keys.",
    };
  }

  if (schema.status === 404) {
    return {
      ok: false,
      error: "The workspace table doesn't exist in this project.",
      hint:
        "Run the migration files in db/migrations/ (in filename order) " +
        "in your Supabase SQL editor before connecting.",
    };
  }

  if (schema.status < 200 || schema.status >= 300) {
    return {
      ok: false,
      error: `Supabase returned ${schema.status} for the schema check.`,
      hint:
        "Verify the URL is correct and the project isn't paused. " +
        "If the problem persists, re-run the migration files in db/migrations/.",
    };
  }

  return { ok: true };
}
