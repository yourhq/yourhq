"use server";

import { cookies } from "next/headers";
import { getWorkspaceSession } from "@/lib/projects/hosted-registry";
import { WORKER_URL, workerHeaders } from "@/lib/worker-client";

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

  const res = await fetch(
    `${WORKER_URL}/workspaces/${session.workspaceId}/siblings`,
    { headers: workerHeaders() },
  );
  if (!res.ok) {
    return { ok: false, error: "Failed to fetch workspaces." };
  }
  const data = (await res.json()) as { workspaces: WorkspaceInfo[] };
  return { ok: true, workspaces: data.workspaces };
}

export async function cancelWorkspaceAction(workspaceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const session = await getWorkspaceSession();
  if (!session) return { ok: false, error: "Not logged in." };

  const siblings = await fetch(
    `${WORKER_URL}/workspaces/${session.workspaceId}/siblings`,
    { headers: workerHeaders() },
  );
  if (!siblings.ok) {
    return { ok: false, error: "Failed to verify workspace ownership." };
  }
  const data = (await siblings.json()) as { workspaces: WorkspaceInfo[] };
  if (!data.workspaces.some((w) => w.id === workspaceId)) {
    return { ok: false, error: "Workspace not found." };
  }

  const res = await fetch(
    `${WORKER_URL}/workspaces/${workspaceId}/cancel`,
    { method: "POST", headers: workerHeaders() },
  );
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: body };
  }
  return { ok: true };
}

export async function getBillingPortalAction(): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const session = await getWorkspaceSession();
  if (!session) return { ok: false, error: "Not logged in." };

  const res = await fetch(
    `${WORKER_URL}/workspaces/${session.workspaceId}/billing-portal`,
    { method: "POST", headers: workerHeaders() },
  );
  if (!res.ok) {
    return { ok: false, error: "Failed to create billing portal session." };
  }
  const data = (await res.json()) as { url: string };
  return { ok: true, url: data.url };
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete("hq_workspace_session");
}
