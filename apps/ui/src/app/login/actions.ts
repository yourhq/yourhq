"use server";

import { cookies, headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  createWorkspaceSessionValue,
  lookupUserWorkspaces,
} from "@/lib/projects/hosted-registry";

export async function hostedLoginAction(email: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const result = await lookupUserWorkspaces(email);
  if (!result || result.workspaces.length === 0) {
    return { ok: true };
  }

  const ws = result.workspaces.find((w) => w.status === "active")
    ?? result.workspaces[0];

  if (!ws.supabase_url || !ws.supabase_anon_key) {
    return { ok: true };
  }

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const siteUrl = `${proto}://${host}`;

  const supabase = createSupabaseClient(ws.supabase_url, ws.supabase_anon_key);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const jar = await cookies();
  const isSecure = proto === "https";
  jar.set("hq_workspace_session", createWorkspaceSessionValue(ws.id), {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true };
}
