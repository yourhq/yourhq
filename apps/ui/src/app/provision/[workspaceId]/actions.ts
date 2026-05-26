"use server";

import { getProvisionStatus, getWorkspaceSession } from "@/lib/workspaces/hosted-registry";
import { workerFetch } from "@/lib/worker-client";

export async function pollProvisionAction(workspaceId: string) {
  const session = await getWorkspaceSession();
  if (!session || session.workspaceId !== workspaceId) {
    return null;
  }
  return getProvisionStatus(workspaceId);
}

export async function retryProvisionAction(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getWorkspaceSession();
  if (!session || session.workspaceId !== workspaceId) {
    return { ok: false, error: "Unauthorized" };
  }

  const res = await workerFetch(`/workspaces/${workspaceId}/retry-provision`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Retry failed" }));
    return { ok: false, error: (body as { error?: string }).error ?? "Retry failed" };
  }
  return { ok: true };
}
