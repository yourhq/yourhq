"use server";

import { cookies, headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  createWorkspaceSessionValue,
  lookupUserWorkspaces,
} from "@/lib/workspaces/hosted-registry";
import { workerFetch } from "@/lib/worker-client";

const HOSTED_EMAIL_COOKIE = "hq_hosted_email";

export async function hostedAuthAction(email: string): Promise<{
  ok: boolean;
  isNewUser?: boolean;
  error?: string;
}> {
  const trimmed = email.toLowerCase().trim();
  if (!trimmed || !trimmed.includes("@")) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const result = await lookupUserWorkspaces(trimmed);

  const activeWs = result?.workspaces.find(
    (w) => w.status === "active" || w.status === "provisioning",
  );

  if (!activeWs?.supabase_url || !activeWs.supabase_anon_key) {
    const jar = await cookies();
    const hdrs = await headers();
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    const isSecure = proto === "https";
    jar.set(HOSTED_EMAIL_COOKIE, trimmed, {
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 2,
    });
    // Clear any stale workspace session from a previous user
    jar.delete("hq_workspace_session");

    return { ok: true, isNewUser: true };
  }

  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const siteUrl = `${proto}://${host}`;

  const supabase = createSupabaseClient(
    activeWs.supabase_url,
    activeWs.supabase_anon_key,
  );
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const jar = await cookies();
  const isSecure = proto === "https";
  jar.set(
    "hq_workspace_session",
    createWorkspaceSessionValue(activeWs.id),
    {
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    },
  );

  workerFetch(`/workspaces/${activeWs.id}/touch`, { method: "POST" }).catch(
    () => {},
  );

  return { ok: true, isNewUser: false };
}
