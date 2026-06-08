"use server";

import { cookies, headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  createWorkspaceSessionValue,
  lookupUserWorkspaces,
} from "@/lib/workspaces/hosted-registry";
import { workerFetch } from "@/lib/worker-client";
import { getRegistry } from "@/lib/workspaces/registry";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_OPTIONS,
} from "@/lib/workspaces/cookie";

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

  workerFetch(`/workspaces/${ws.id}/touch`, { method: "POST" }).catch(() => {});

  return { ok: true };
}

export async function loginAcrossWorkspaces(
  email: string,
  password: string,
): Promise<{
  ok: boolean;
  error?: string;
  activeWorkspaceId?: string;
  matchedWorkspaceIds: string[];
}> {
  const registry = await getRegistry();
  if (registry.workspaces.length === 0) {
    return { ok: false, error: "No workspaces configured.", matchedWorkspaceIds: [] };
  }

  const jar = await cookies();
  const currentActiveId = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;

  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const results = await Promise.allSettled(
    registry.workspaces.map(async (workspace) => {
      const cookiePrefix = `hq-${workspace.id.slice(0, 8)}`;

      const supabase = createServerClient(workspace.url, workspace.anonKey, {
        cookieOptions: { name: cookiePrefix },
        cookies: {
          getAll() {
            return jar.getAll();
          },
          setAll(cookiesToSet) {
            for (const cookie of cookiesToSet) {
              pendingCookies.push(cookie);
            }
          },
        },
      });

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      return workspace.id;
    }),
  );

  const matchedIds: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      matchedIds.push(r.value);
    }
  }

  if (matchedIds.length === 0) {
    return {
      ok: false,
      error: "Invalid login credentials",
      matchedWorkspaceIds: [],
    };
  }

  for (const cookie of pendingCookies) {
    jar.set(cookie.name, cookie.value, cookie.options);
  }

  const landingId = currentActiveId && matchedIds.includes(currentActiveId)
    ? currentActiveId
    : matchedIds[0];

  jar.set(ACTIVE_WORKSPACE_COOKIE, landingId, ACTIVE_WORKSPACE_COOKIE_OPTIONS);

  return {
    ok: true,
    activeWorkspaceId: landingId,
    matchedWorkspaceIds: matchedIds,
  };
}
