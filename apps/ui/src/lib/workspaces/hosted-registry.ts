import "server-only";

import type {
  PublicWorkspace,
  WorkspaceSecrets,
  WorkspaceWithSecrets,
  OnboardingState,
} from "./schema";
import { cookies } from "next/headers";
import { workerFetch } from "@/lib/worker-client";
import { createHmac, timingSafeEqual } from "node:crypto";

interface HostedWorkspaceData {
  id: string;
  label: string;
  emoji: string | null;
  status: string;
  supabase_url: string | null;
  supabase_anon_key: string | null;
  supabase_service_role_key: string | null;
  setup_metadata?: Record<string, unknown>;
}

interface WorkspaceSession {
  workspaceId: string;
  iat: number;
}

const SESSION_COOKIE = "hq_workspace_session";
export { SESSION_COOKIE as HOSTED_SESSION_COOKIE };

function signingSecret(): string {
  const secret = process.env.WORKER_INTERNAL_TOKEN;
  if (!secret || secret.length < 32) {
    throw new Error("WORKER_INTERNAL_TOKEN must be set to validate hosted sessions");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function verifySignature(payload: string, signature: string): boolean {
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createWorkspaceSessionValue(workspaceId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ workspaceId, iat: Math.floor(Date.now() / 1000) }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export async function getWorkspaceSession(): Promise<WorkspaceSession | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || !verifySignature(payload, signature)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as WorkspaceSession;
  } catch {
    return null;
  }
}

async function fetchHostedWorkspace(workspaceId: string): Promise<HostedWorkspaceData | null> {
  const res = await workerFetch(`/workspaces/${workspaceId}/connection`, {
    cache: "no-store" as RequestCache,
  });
  if (!res.ok) return null;
  return res.json();
}

function hostedToPublicWorkspace(data: HostedWorkspaceData): PublicWorkspace {
  return {
    id: data.id,
    label: data.label || "Workspace",
    emoji: data.emoji || "🏠",
    url: data.supabase_url || "",
    anonKey: data.supabase_anon_key || "",
    isDefault: true,
    createdAt: new Date().toISOString(),
    uiOrigins: [],
  };
}

export async function getActiveWorkspace(
  _activeIdHint?: string | null,
): Promise<PublicWorkspace | null> {
  const session = await getWorkspaceSession();
  if (!session) return null;
  const workspace = await fetchHostedWorkspace(session.workspaceId);
  if (!workspace?.supabase_url || !workspace.supabase_anon_key) return null;
  return hostedToPublicWorkspace(workspace);
}

export async function getActiveWorkspaceWithSecrets(
  _activeIdHint?: string | null,
): Promise<WorkspaceWithSecrets | null> {
  const session = await getWorkspaceSession();
  if (!session) return null;
  const workspace = await fetchHostedWorkspace(session.workspaceId);
  if (!workspace?.supabase_url || !workspace.supabase_anon_key || !workspace.supabase_service_role_key) {
    return null;
  }
  return {
    ...hostedToPublicWorkspace(workspace),
    serviceRoleKey: workspace.supabase_service_role_key,
  };
}

export async function getWorkspaceSecrets(
  id: string,
): Promise<WorkspaceSecrets | null> {
  const session = await getWorkspaceSession();
  if (!session || session.workspaceId !== id) return null;
  const workspace = await fetchHostedWorkspace(session.workspaceId);
  if (!workspace?.supabase_service_role_key) return null;
  return { serviceRoleKey: workspace.supabase_service_role_key };
}

export async function listSiblingWorkspaces(): Promise<PublicWorkspace[]> {
  const session = await getWorkspaceSession();
  if (!session) return [];

  const res = await workerFetch(
    `/workspaces/${session.workspaceId}/siblings`,
    { cache: "no-store" as RequestCache },
  );
  if (!res.ok) return [];

  const data = (await res.json()) as {
    workspaces: Array<{
      id: string;
      label: string;
      emoji: string | null;
      subscription_status: string;
    }>;
  };

  return data.workspaces
    .filter((w) => w.subscription_status === "active")
    .map((w) => ({
      id: w.id,
      label: w.label || "Workspace",
      emoji: w.emoji || "🏠",
      url: "",
      anonKey: "",
      isDefault: w.id === session.workspaceId,
      createdAt: new Date().toISOString(),
      uiOrigins: [],
    }));
}

export async function canAccessWorkspace(workspaceId: string): Promise<boolean> {
  const session = await getWorkspaceSession();
  if (!session) return false;
  if (session.workspaceId === workspaceId) return true;
  const siblings = await listSiblingWorkspaces();
  return siblings.some((w) => w.id === workspaceId);
}

function deriveHostedStep(
  subscriptionStatus: string | undefined,
  provisionStage: string | null | undefined,
  metadata: Record<string, unknown>,
): string {
  if (subscriptionStatus === "pending") return "payment";
  if (
    subscriptionStatus === "provisioning" ||
    (provisionStage && provisionStage !== "complete" && provisionStage !== "error")
  ) {
    return "provisioning";
  }

  if (metadata.onboardingComplete) return "done";
  if (metadata.agentId) return "agent";
  if (metadata.providerId) return "agent";
  return "provider";
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const session = await getWorkspaceSession();
  if (session) {
    const workspace = await fetchHostedWorkspace(session.workspaceId);
    const metadata = workspace?.setup_metadata ?? {};
    const complete = metadata.onboardingComplete === true;

    const status = await getProvisionStatus(session.workspaceId).catch(() => null);
    const subscriptionStatus = status?.subscription_status ?? workspace?.status;
    const provisionStage = status?.provision_stage ?? null;

    const step = complete
      ? "done"
      : deriveHostedStep(subscriptionStatus, provisionStage, metadata);


    return {
      version: 1 as const,
      step: complete ? "done" : "welcome",
      complete,
      data: {
        ownerName: metadata.ownerName,
        preferredName: metadata.preferredName ?? metadata.ownerName,
        workspaceName: metadata.workspaceName ?? workspace?.label,
        workspaceLabel: metadata.workspaceName ?? workspace?.label,
        workspaceSlug: metadata.workspaceSlug,
        intentKey: metadata.intentKey ?? metadata.contextPreset,
        contextPresetKey: metadata.contextPresetKey ?? metadata.contextPreset,
        providerId: metadata.providerId,
        providerCommandId: metadata.providerCommandId,
        agentId: metadata.agentId,
        agentSlug: metadata.agentSlug,
        agentName: metadata.agentName,
        agentEmoji: metadata.agentEmoji,
        hostedInitialStep: step,
        hostedWorkspaceId: session.workspaceId,
      },
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

export async function patchOnboardingState(
  patch: Partial<Pick<OnboardingState, "step" | "complete">> & {
    data?: Record<string, unknown>;
  },
): Promise<OnboardingState> {
  const session = await getWorkspaceSession();
  if (!session) return getOnboardingState();

  await workerFetch(`/workspaces/${session.workspaceId}/onboarding`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  return getOnboardingState();
}

export async function lookupUserWorkspaces(
  email: string,
): Promise<{ userId: string; workspaces: HostedWorkspaceData[] } | null> {
  const res = await workerFetch(
    `/users/by-email/${encodeURIComponent(email)}`,
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
  auto_login_token_hash: string | null;
  auto_login_type: string;
} | null> {
  const res = await workerFetch(
    `/workspaces/${workspaceId}/status`,
  );
  if (!res.ok) return null;
  return res.json();
}
