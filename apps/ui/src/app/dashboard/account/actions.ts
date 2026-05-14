"use server";

import { cookies, headers } from "next/headers";
import { getWorkspaceSession, createWorkspaceSessionValue } from "@/lib/workspaces/hosted-registry";
import { workerFetch } from "@/lib/worker-client";

interface WorkspaceInfo {
  id: string;
  label: string;
  emoji: string | null;
  subscription_status: string;
  e2b_sandbox_status: string;
}

export async function listWorkspacesAction(): Promise<{
  ok: boolean;
  workspaces?: WorkspaceInfo[];
  error?: string;
}> {
  const session = await getWorkspaceSession();
  if (!session) return { ok: false, error: "Not logged in." };

  try {
    const res = await workerFetch(
      `/workspaces/${session.workspaceId}/siblings`,
    );
    if (!res.ok) {
      return { ok: false, error: "Failed to fetch workspaces." };
    }
    const data = (await res.json()) as { workspaces: WorkspaceInfo[] };
    return { ok: true, workspaces: data.workspaces };
  } catch {
    return { ok: false, error: "Unable to reach the workspace service. Please try again." };
  }
}

export async function cancelWorkspaceAction(workspaceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const session = await getWorkspaceSession();
  if (!session) return { ok: false, error: "Not logged in." };

  try {
    const siblings = await workerFetch(
      `/workspaces/${session.workspaceId}/siblings`,
    );
    if (!siblings.ok) {
      return { ok: false, error: "Failed to verify workspace ownership." };
    }
    const data = (await siblings.json()) as { workspaces: WorkspaceInfo[] };
    if (!data.workspaces.some((w) => w.id === workspaceId)) {
      return { ok: false, error: "Workspace not found." };
    }

    const res = await workerFetch(
      `/workspaces/${workspaceId}/cancel`,
      { method: "POST" },
    );
    if (!res.ok) {
      return { ok: false, error: "Cancellation failed. Please try again or contact support." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to reach the workspace service. Please try again." };
  }
}

export async function getBillingPortalAction(): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const session = await getWorkspaceSession();
  if (!session) return { ok: false, error: "Not logged in." };

  try {
    const res = await workerFetch(
      `/workspaces/${session.workspaceId}/billing-portal`,
      { method: "POST" },
    );
    if (!res.ok) {
      return { ok: false, error: "Failed to open billing portal. Please try again." };
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) {
      return { ok: false, error: "Billing portal is not available." };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, error: "Unable to reach the billing service. Please try again." };
  }
}

export async function switchWorkspaceAction(workspaceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const session = await getWorkspaceSession();
  if (!session) return { ok: false, error: "Not logged in." };

  if (session.workspaceId === workspaceId) return { ok: true };

  try {
    const res = await workerFetch(
      `/workspaces/${session.workspaceId}/siblings`,
    );
    if (!res.ok) return { ok: false, error: "Failed to verify workspace ownership." };
    const data = (await res.json()) as { workspaces: WorkspaceInfo[] };
    const target = data.workspaces.find((w) => w.id === workspaceId);
    if (!target) return { ok: false, error: "Workspace not found." };
    if (target.subscription_status !== "active") {
      return { ok: false, error: "That workspace is not active." };
    }

    const jar = await cookies();
    const hdrs = await headers();
    const proto = hdrs.get("x-forwarded-proto") ?? "http";
    jar.set("hq_workspace_session", createWorkspaceSessionValue(workspaceId), {
      path: "/",
      httpOnly: true,
      secure: proto === "https",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });

    workerFetch(`/workspaces/${workspaceId}/touch`, { method: "POST" }).catch(() => {});

    return { ok: true };
  } catch {
    return { ok: false, error: "Unable to switch workspace. Please try again." };
  }
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete("hq_workspace_session");
  jar.delete("hq_hosted_email");
}
