// Supabase credentials validator — used by the onboarding flow and
// the Add Project dialog.
//
// Validation strategy:
//   1. Anon key: hit /auth/v1/settings — a public endpoint that doesn't
//      need RLS, returns 200 with any valid key, 401 with an invalid one.
//      Simpler + more reliable than querying /rest/v1/.
//   2. Service role: same endpoint with the service key.
//   3. Schema check: query /rest/v1/workspace with the service role key.
//      404 means the migration didn't run; 200/204 means it did.

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

export async function validateSupabaseCreds(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ValidateResult> {
  const base = input.url.replace(/\/$/, "");
  const authEndpoint = `${base}/auth/v1/settings`;
  const schemaEndpoint = `${base}/rest/v1/workspace?select=id&limit=1`;

  // 1. Anon key
  const anonProbe = await probe(authEndpoint, input.anonKey);
  if (anonProbe.error) {
    return {
      ok: false,
      error: `Could not reach ${base}: ${anonProbe.error}`,
      hint: "Check the URL and your network connection.",
    };
  }
  if (anonProbe.status === 401 || anonProbe.status === 403) {
    return {
      ok: false,
      error: "Anon key rejected by Supabase.",
      hint: "Double-check the anon key in Supabase → Project Settings → API.",
    };
  }
  if (anonProbe.status === 404) {
    return {
      ok: false,
      error: "URL doesn't look like a Supabase project.",
      hint: `No /auth/v1/settings endpoint at ${base}. Is the URL correct?`,
    };
  }
  if (anonProbe.status < 200 || anonProbe.status >= 300) {
    return {
      ok: false,
      error: `Supabase returned ${anonProbe.status} for the anon key check.`,
      hint: "Verify the URL and that the project isn't paused.",
    };
  }

  // 2. Service role key
  const serviceProbe = await probe(authEndpoint, input.serviceRoleKey);
  if (serviceProbe.status === 401 || serviceProbe.status === 403) {
    return {
      ok: false,
      error: "Service role key rejected by Supabase.",
      hint: "Double-check the service_role secret in Supabase → Project Settings → API.",
    };
  }

  // 3. Schema check — was the migration run?
  const schemaProbe = await probe(schemaEndpoint, input.serviceRoleKey);
  if (schemaProbe.status === 404) {
    return {
      ok: false,
      error: "The workspace table doesn't exist in this project.",
      hint:
        "Run db/migrations/001_schema.sql in your Supabase SQL editor " +
        "before connecting.",
    };
  }
  if (schemaProbe.status < 200 || schemaProbe.status >= 300) {
    return {
      ok: false,
      error: `Schema check returned ${schemaProbe.status}.`,
      hint: "The migration may be incomplete. Re-run db/migrations/001_schema.sql.",
    };
  }

  return { ok: true };
}
