"use server";

import { cookies } from "next/headers";

const WORKER_URL = process.env.WORKER_URL ?? "http://worker:3001";

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
  const jar = await cookies();
  const raw = jar.get("hq_workspace_session")?.value;
  if (!raw) return { ok: false, error: "Not logged in." };

  let session: { workspaceId: string };
  try {
    session = JSON.parse(Buffer.from(raw, "base64url").toString());
  } catch {
    return { ok: false, error: "Invalid session." };
  }

  const res = await fetch(
    `${WORKER_URL}/workspaces/${session.workspaceId}/siblings`,
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
  const res = await fetch(
    `${WORKER_URL}/workspaces/${workspaceId}/cancel`,
    { method: "POST" },
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
  const jar = await cookies();
  const raw = jar.get("hq_workspace_session")?.value;
  if (!raw) return { ok: false, error: "Not logged in." };

  let session: { workspaceId: string };
  try {
    session = JSON.parse(Buffer.from(raw, "base64url").toString());
  } catch {
    return { ok: false, error: "Invalid session." };
  }

  const res = await fetch(
    `${WORKER_URL}/workspaces/${session.workspaceId}/billing-portal`,
    { method: "POST" },
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
