"use server";

import { cookies, headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { lookupUserWorkspaces } from "@/lib/projects/hosted-registry";

export async function hostedLoginAction(email: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const result = await lookupUserWorkspaces(email);
  if (!result || result.workspaces.length === 0) {
    return { ok: false, error: "No workspace found for this email." };
  }

  const ws = result.workspaces.find((w) => w.status === "active")
    ?? result.workspaces[0];

  if (!ws.supabase_url || !ws.supabase_anon_key) {
    return { ok: false, error: "Workspace is still being set up." };
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
  const session = {
    workspaceId: ws.id,
    supabaseUrl: ws.supabase_url,
    supabaseAnonKey: ws.supabase_anon_key,
    serviceRoleKey: ws.supabase_service_role_key ?? "",
  };
  const isSecure = proto === "https";
  jar.set("hq_workspace_session", Buffer.from(JSON.stringify(session)).toString("base64url"), {
    path: "/",
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true };
}
