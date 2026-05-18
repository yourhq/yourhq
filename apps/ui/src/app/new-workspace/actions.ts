"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { addWorkspace } from "@/lib/workspaces/registry";
import { getPostHogClient } from "@/lib/posthog-server";
import {
  ACTIVE_WORKSPACE_COOKIE,
  ACTIVE_WORKSPACE_COOKIE_OPTIONS,
} from "@/lib/workspaces/cookie";
import { validateSupabaseCreds } from "@/lib/workspaces/validate";
import { prepareSchemaInstall, verifySchemaInstalled } from "@/lib/workspaces/install-schema";
import { createAuthUser } from "@/lib/workspaces/create-user";
import { workerFetch } from "@/lib/worker-client";
import {
  createWorkspaceSessionValue,
} from "@/lib/workspaces/hosted-registry";

interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  hint?: string;
  data?: T;
}

const dbSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(20),
  serviceRoleKey: z.string().min(20),
});

export async function validateNewWorkspaceDb(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ActionResult<{ schemaNeeded: boolean; projectRef?: string; sqlEditorUrl?: string; sql?: string }>> {
  const parsed = dbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check that URL and both keys are filled in." };
  }

  const validation = await validateSupabaseCreds(parsed.data);
  const schemaMissing =
    !validation.ok && (validation.error?.includes("workspace table") ?? false);

  if (!validation.ok && !schemaMissing) {
    return { ok: false, error: validation.error ?? "Connection failed" };
  }

  if (schemaMissing) {
    const prep = await prepareSchemaInstall({
      url: parsed.data.url,
      serviceRoleKey: parsed.data.serviceRoleKey,
    });
    if (!prep.ok) {
      return { ok: false, error: prep.error };
    }
    return {
      ok: true,
      data: {
        schemaNeeded: true,
        projectRef: prep.projectRef ?? undefined,
        sqlEditorUrl: prep.sqlEditorUrl,
        sql: prep.sql,
      },
    };
  }

  return { ok: true, data: { schemaNeeded: false } };
}

export async function confirmNewWorkspaceSchema(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ActionResult> {
  const parsed = dbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid credentials" };
  }
  const installed = await verifySchemaInstalled({
    url: parsed.data.url,
    serviceRoleKey: parsed.data.serviceRoleKey,
  });
  if (!installed) {
    return { ok: false, error: "Schema not found. Please run the SQL first, then try again." };
  }
  return { ok: true };
}

export async function createOssWorkspace(input: {
  label: string;
  emoji: string;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  email: string;
  password: string;
}): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = dbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid database credentials" };
  }

  const workspace = await addWorkspace({
    label: input.label || "My Workspace",
    emoji: input.emoji || "🏠",
    url: parsed.data.url,
    anonKey: parsed.data.anonKey,
    serviceRoleKey: parsed.data.serviceRoleKey,
    makeDefault: false,
  });

  const jar = await cookies();
  jar.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, ACTIVE_WORKSPACE_COOKIE_OPTIONS);

  const userResult = await createAuthUser({
    url: parsed.data.url,
    serviceRoleKey: parsed.data.serviceRoleKey,
    email: input.email,
    password: input.password,
  });

  if (!userResult.ok && !userResult.error?.includes("already exists")) {
    return { ok: false, error: userResult.error ?? "Failed to create account" };
  }

  return { ok: true, data: { workspaceId: workspace.id } };
}

export async function createHostedWorkspaceCheckout(params: {
  email: string;
  ownerName: string;
  workspaceLabel: string;
  workspaceEmoji: string;
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
      successUrl: `${origin}/new-workspace?stripe_success=1`,
      cancelUrl: `${origin}/new-workspace?stripe_canceled=1`,
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

  getPostHogClient()?.capture({
    distinctId: params.email,
    event: "checkout_initiated",
    properties: {
      workspace_id: data.workspaceId,
      workspace_label: params.workspaceLabel,
      owner_name: params.ownerName,
    },
  });

  return { url: data.url, workspaceId: data.workspaceId };
}
