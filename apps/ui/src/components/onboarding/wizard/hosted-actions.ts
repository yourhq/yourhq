"use server";

import { cookies, headers } from "next/headers";
import { workerFetch } from "@/lib/worker-client";
import {
  getProvisionStatus,
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

  return { url: data.url, workspaceId: data.workspaceId };
}

export async function pollProvisionStatus(workspaceId: string) {
  return getProvisionStatus(workspaceId);
}
