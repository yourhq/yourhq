// Gateway-backed file operations. The UI server makes authenticated HTTP
// requests directly to the gateway's files-API process (never across the
// public internet — the connection is inside the Docker network, or
// across a Tailscale tailnet, depending on deployment).

import type { GitHubTreeEntry, GitHubFileContent } from "@/lib/agent-repo/types";
import type { BrowserState } from "@/lib/agent-repo/browser-types";
import { getOrCreateGatewayAuthToken } from "@/lib/workspaces/gateway-auth-token";

async function getEnv() {
  const base = process.env.GATEWAY_URL;
  if (!base) {
    throw new Error("GATEWAY_URL is not configured");
  }
  // Token is auto-managed: pulled from /config/gateway-auth-token,
  // generated there on first boot. Falls back to GATEWAY_AUTH_TOKEN
  // env var for legacy installs that wrote it to .env directly.
  const token = await getOrCreateGatewayAuthToken();
  return { base: base.replace(/\/$/, ""), token };
}

async function request<T>(
  method: "GET" | "PUT" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const { base, token } = await getEnv();
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

export async function getFileTree(branch: string): Promise<GitHubTreeEntry[]> {
  return request<GitHubTreeEntry[]>(
    "GET",
    `/branches/${encodeBranch(branch)}/tree`
  );
}

export async function getFileContent(
  branch: string,
  path: string
): Promise<GitHubFileContent> {
  const data = await request<{ path: string; content: string; sha: string }>(
    "GET",
    `/branches/${encodeBranch(branch)}/files/${path}`
  );
  return { path: data.path, content: data.content, sha: data.sha };
}

export async function saveFile(
  branch: string,
  path: string,
  content: string,
  sha: string,
): Promise<string> {
  const data = await request<{ path: string; sha: string }>(
    "PUT",
    `/branches/${encodeBranch(branch)}/files/${path}`,
    { content, sha }
  );
  return data.sha;
}

export async function createFile(
  branch: string,
  path: string,
  content: string,
): Promise<string> {
  const data = await request<{ path: string; sha: string }>(
    "POST",
    `/branches/${encodeBranch(branch)}/files/${path}`,
    { content }
  );
  return data.sha;
}

export async function deleteFile(
  branch: string,
  path: string,
  sha: string,
): Promise<void> {
  await request<{ ok: true }>(
    "DELETE",
    `/branches/${encodeBranch(branch)}/files/${path}`,
    { sha }
  );
}

// Branch existence / creation: add-agent.sh handles branch creation at
// provision time. The UI shouldn't need to create branches directly;
// these exist to keep route signatures stable.
export async function branchExists(branch: string): Promise<boolean> {
  try {
    await getFileTree(branch);
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

export async function getBrowserState(slug: string): Promise<BrowserState> {
  return request<BrowserState>("GET", `/browser/${encodeURIComponent(slug)}/state`);
}

export async function getBrowserScreenshot(
  slug: string,
  opts?: { quality?: number; maxWidth?: number }
): Promise<Response> {
  const { base, token } = await getEnv();
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
