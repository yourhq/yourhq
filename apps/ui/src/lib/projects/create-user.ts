// Creates the first Supabase auth user for a freshly-connected project.
// Replaces the manual "Add user in the Supabase dashboard" step that
// today's docs/INSTALL.md walks through.
//
// Uses Supabase's admin REST API with the service role key:
//   POST <url>/auth/v1/admin/users
//   Authorization: Bearer <service_role_key>
//   { email, password, email_confirm: true }
//
// We set email_confirm: true so the user doesn't need to click a
// confirmation email they never got (they'd have to configure SMTP in
// Supabase first, which is out of scope for onboarding).

import "server-only";

export interface CreateAuthUserInput {
  url: string;
  serviceRoleKey: string;
  email: string;
  password: string;
}

export interface CreateAuthUserResult {
  ok: boolean;
  userId?: string;
  error?: string;
  hint?: string;
}

function parseError(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    return (
      (typeof parsed.msg === "string" && parsed.msg) ||
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.error_description === "string" && parsed.error_description) ||
      null
    );
  } catch {
    return null;
  }
}

export async function createAuthUser(
  input: CreateAuthUserInput,
): Promise<CreateAuthUserResult> {
  const base = input.url.replace(/\/$/, "");
  const endpoint = `${base}/auth/v1/admin/users`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        email_confirm: true,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Couldn't reach Supabase: ${(err as Error).message}`,
    };
  }

  if (res.ok) {
    const parsed = await res.json().catch(() => ({}));
    return {
      ok: true,
      userId: typeof parsed?.id === "string" ? parsed.id : undefined,
    };
  }

  const body = await res.text().catch(() => "");
  const msg = parseError(body);
  console.error(`[createAuthUser] ${res.status} response: ${body.slice(0, 500)}`);

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      error: msg ?? "Secret key was rejected by Supabase.",
      hint: `HTTP ${res.status}. Check the service_role key in Project Settings → API.`,
    };
  }

  if (res.status === 422 || res.status === 400) {
    // Already-exists is the most common case — treat as soft success
    // if the caller wanted "ensure a user with this email exists."
    if (msg && /already|exist|registered/i.test(msg)) {
      return {
        ok: false,
        error: "An account with that email already exists.",
        hint: "Try signing in instead, or use a different email.",
      };
    }
    if (msg && /password/i.test(msg)) {
      return {
        ok: false,
        error: `Password rejected: ${msg}`,
        hint: "Supabase requires at least 6 characters by default.",
      };
    }
    if (msg && /email/i.test(msg)) {
      return {
        ok: false,
        error: `Email rejected: ${msg}`,
      };
    }
    return {
      ok: false,
      error: msg ?? `Supabase rejected the request (${res.status}).`,
    };
  }

  return {
    ok: false,
    error: msg ?? `Supabase returned ${res.status} creating the user.`,
  };
}
