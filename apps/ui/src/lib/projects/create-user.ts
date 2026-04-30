import "server-only";

import { createClient } from "@supabase/supabase-js";

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

export async function createAuthUser(
  input: CreateAuthUserInput,
): Promise<CreateAuthUserResult> {
  const supabase = createClient(input.url, input.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (!error) {
    return { ok: true, userId: data.user?.id };
  }

  const msg = error.message ?? "";
  console.error(`[createAuthUser] error: ${msg} (status: ${error.status})`);

  if (/already|exist|registered/i.test(msg)) {
    return {
      ok: false,
      error: "An account with that email already exists.",
      hint: "Try signing in instead, or use a different email.",
    };
  }

  if (/password/i.test(msg)) {
    return {
      ok: false,
      error: `Password rejected: ${msg}`,
      hint: "Supabase requires at least 6 characters by default.",
    };
  }

  if (/invalid.*key|unauthorized|forbidden/i.test(msg)) {
    return {
      ok: false,
      error: msg,
      hint: "Check the service_role key in Project Settings → API.",
    };
  }

  return { ok: false, error: msg };
}
