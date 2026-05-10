"use server";

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { workerFetch } from "@/lib/worker-client";
import {
  getProvisionStatus,
  getActiveProject,
  createWorkspaceSessionValue,
} from "@/lib/projects/hosted-registry";

const HOSTED_EMAIL_COOKIE = "hq_hosted_email";

export async function getHostedEmail(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(HOSTED_EMAIL_COOKIE)?.value ?? null;
}

export async function createHostedCheckout(params: {
  email: string;
  ownerName: string;
  workspaceLabel: string;
  workspaceEmoji: string;
  contextPreset: string;
}): Promise<{ url: string; workspaceId: string }> {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  const res = await workerFetch("/checkout", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      ownerName: params.ownerName,
      workspaceLabel: params.workspaceLabel,
      workspaceEmoji: params.workspaceEmoji,
      contextPreset: params.contextPreset,
      successUrl: `${origin}/onboarding?stripe_success=1`,
      cancelUrl: `${origin}/onboarding?stripe_canceled=1`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Failed to create checkout session");
  }

  const data = (await res.json()) as { url?: string; workspaceId?: string };
  if (!data.url || !data.workspaceId) {
    throw new Error("Checkout session could not be created");
  }

  const jar = await cookies();
  const isSecure = proto === "https";
  jar.set(
    "hq_workspace_session",
    createWorkspaceSessionValue(data.workspaceId),
    {
      path: "/",
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    },
  );
  // Email cookie has been consumed — clean it up
  jar.delete(HOSTED_EMAIL_COOKIE);

  return { url: data.url, workspaceId: data.workspaceId };
}

export async function pollProvisionStatus(workspaceId: string) {
  return getProvisionStatus(workspaceId);
}

export async function verifyAutoLogin(
  tokenHash: string,
  type: "magiclink" | "email" = "magiclink",
): Promise<{ ok: boolean; error?: string }> {
  const project = await getActiveProject().catch(() => null);
  if (!project?.url || !project.anonKey) {
    return { ok: false, error: "No workspace configured" };
  }

  const cookieStore = await cookies();
  const cookiePrefix = `hq-${project.id.slice(0, 8)}`;

  const supabase = createServerClient(project.url, project.anonKey, {
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
          // May throw in certain RSC contexts
        }
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
