// Gateway-backed file operations. The UI server makes authenticated HTTP
// requests to the gateway's files-API process.
//
// Resolution order for the gateway URL:
//   1. GATEWAY_URL env var (self-hosted Docker deployments)
//   2. gateways.meta.reachable_urls.files_api from the DB (hosted / E2B)
//
// Auth token resolution:
//   1. /config/gateway-auth-token file or GATEWAY_AUTH_TOKEN env (self-hosted)
//   2. gateways.meta.files_api_token from the DB (hosted / E2B)

import type { GitHubTreeEntry, GitHubFileContent } from "@/lib/agent-repo/types";
import type { BrowserState } from "@/lib/agent-repo/browser-types";
import { getOrCreateGatewayAuthToken } from "@/lib/workspaces/gateway-auth-token";
import { createAdminClient } from "@/lib/supabase/admin";

async function getEnv(gatewayId?: string) {
  // Self-hosted: env var takes precedence
  const envBase = process.env.GATEWAY_URL;
  if (envBase) {
    const token = await getOrCreateGatewayAuthToken();
    return { base: envBase.replace(/\/$/, ""), token };
  }

  // Hosted: look up from the gateway's meta in the DB
  if (!gatewayId) {
    throw new Error(
      "GATEWAY_URL is not configured and no gatewayId was provided to look up dynamically",
    );
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("gateways")
    .select("meta")
    .eq("id", gatewayId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Gateway ${gatewayId} not found`);
  }

  const meta = (data.meta ?? {}) as {
    reachable_urls?: { files_api?: string };
    files_api_token?: string;
  };

  const base = meta.reachable_urls?.files_api;
  const token = meta.files_api_token;

  if (!base) {
    throw new Error(
      `Gateway ${gatewayId} has no files_api URL configured`,
    );
  }
  if (!token) {
    throw new Error(
      `Gateway ${gatewayId} has no files_api_token configured`,
    );
  }

  return { base: base.replace(/\/$/, ""), token };
}

async function request<T>(
  method: "GET" | "PUT" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  gatewayId?: string,
): Promise<T> {
  const { base, token } = await getEnv(gatewayId);
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    // Server-side fetch — no credentials semantics needed.
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Gateway ${method} ${path} -> ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // non-JSON body; keep the generic message
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function encodeBranch(branch: string): string {
  // Branch names can contain slashes (e.g. "my-workspace/coffee") which
  // collide with URL path segmentation. Encode them fully so the server
  // sees a single segment.
  return encodeURIComponent(branch);
}

export async function getFileTree(branch: string, gatewayId?: string): Promise<GitHubTreeEntry[]> {
  return request<GitHubTreeEntry[]>(
    "GET",
    `/branches/${encodeBranch(branch)}/tree`,
    undefined,
    gatewayId,
  );
}

export async function getFileContent(
  branch: string,
  path: string,
  gatewayId?: string,
): Promise<GitHubFileContent> {
  const data = await request<{ path: string; content: string; sha: string }>(
    "GET",
    `/branches/${encodeBranch(branch)}/files/${path}`,
    undefined,
    gatewayId,
  );
  return { path: data.path, content: data.content, sha: data.sha };
}

export async function saveFile(
  branch: string,
  path: string,
  content: string,
  sha: string,
  gatewayId?: string,
): Promise<string> {
  const data = await request<{ path: string; sha: string }>(
    "PUT",
    `/branches/${encodeBranch(branch)}/files/${path}`,
    { content, sha },
    gatewayId,
  );
  return data.sha;
}

export async function createFile(
  branch: string,
  path: string,
  content: string,
  gatewayId?: string,
): Promise<string> {
  const data = await request<{ path: string; sha: string }>(
    "POST",
    `/branches/${encodeBranch(branch)}/files/${path}`,
    { content },
    gatewayId,
  );
  return data.sha;
}

export async function deleteFile(
  branch: string,
  path: string,
  sha: string,
  gatewayId?: string,
): Promise<void> {
  await request<{ ok: true }>(
    "DELETE",
    `/branches/${encodeBranch(branch)}/files/${path}`,
    { sha },
    gatewayId,
  );
}

export async function branchExists(branch: string, gatewayId?: string): Promise<boolean> {
  try {
    await getFileTree(branch, gatewayId);
    return true;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return false;
    throw e;
  }
}

export async function createBranch(): Promise<void> {
  throw new Error(
    "Branch creation via the UI is not supported in gateway mode; " +
      "agents are provisioned through the Create Agent wizard which " +
      "creates the branch on the gateway side."
  );
}

// ── Browser / CDP ─────────────────────────────────────────────────────

export async function getBrowserState(slug: string, gatewayId?: string): Promise<BrowserState> {
  return request<BrowserState>("GET", `/browser/${encodeURIComponent(slug)}/state`, undefined, gatewayId);
}

export async function getBrowserScreenshot(
  slug: string,
  opts?: { quality?: number; maxWidth?: number },
  gatewayId?: string,
): Promise<Response> {
  const { base, token } = await getEnv(gatewayId);
  const params = new URLSearchParams();
  if (opts?.quality) params.set("quality", String(opts.quality));
  if (opts?.maxWidth) params.set("maxWidth", String(opts.maxWidth));
  const qs = params.toString();
  const url = `${base}/browser/${encodeURIComponent(slug)}/screenshot${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = new Error(`Gateway screenshot -> ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res;
}
