import "server-only";

import type {
  PublicProject,
  ProjectSecrets,
  ProjectWithSecrets,
  OnboardingState,
} from "./schema";
import { cookies } from "next/headers";

const WORKER_URL = process.env.WORKER_URL ?? "http://worker:3001";

interface HostedWorkspaceData {
  id: string;
  label: string;
  emoji: string | null;
  status: string;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  supabase_service_role_key: string | null;
}

interface WorkspaceSession {
  workspaceId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
}

async function getSession(): Promise<WorkspaceSession | null> {
  const jar = await cookies();
  const raw = jar.get("hq_workspace_session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString()) as WorkspaceSession;
  } catch {
    return null;
  }
}

function sessionToProject(session: WorkspaceSession): PublicProject {
  return {
    id: session.workspaceId,
    label: "Workspace",
    emoji: "🏠",
    url: session.supabaseUrl,
    anonKey: session.supabaseAnonKey,
    isDefault: true,
    createdAt: new Date().toISOString(),
    uiOrigins: [],
  };
}

export async function getActiveProject(
  _activeIdHint?: string | null,
): Promise<PublicProject | null> {
  const session = await getSession();
  if (!session) return null;
  return sessionToProject(session);
}

export async function getActiveProjectWithSecrets(
  _activeIdHint?: string | null,
): Promise<ProjectWithSecrets | null> {
  const session = await getSession();
  if (!session) return null;
  return {
    ...sessionToProject(session),
    serviceRoleKey: session.serviceRoleKey,
  };
}

export async function getProjectSecrets(
  _id: string,
): Promise<ProjectSecrets | null> {
  const session = await getSession();
  if (!session) return null;
  return { serviceRoleKey: session.serviceRoleKey };
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const session = await getSession();
  if (session) {
    return {
      version: 1 as const,
      step: "done",
      complete: true,
      data: {},
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    version: 1 as const,
    step: "welcome",
    complete: false,
    data: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function lookupUserWorkspaces(
  email: string,
): Promise<{ userId: string; workspaces: HostedWorkspaceData[] } | null> {
  const res = await fetch(
    `${WORKER_URL}/users/by-email/${encodeURIComponent(email)}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    user: { id: string };
    workspaces: HostedWorkspaceData[];
  };
  return { userId: data.user.id, workspaces: data.workspaces };
}

export async function getProvisionStatus(workspaceId: string): Promise<{
  provision_stage: string | null;
  provision_error: string | null;
  subscription_status: string;
  e2b_sandbox_status: string;
} | null> {
  const res = await fetch(`${WORKER_URL}/workspaces/${workspaceId}/status`);
  if (!res.ok) return null;
  return res.json();
}
