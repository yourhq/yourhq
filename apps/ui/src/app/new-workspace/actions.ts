"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { addWorkspace, getActiveWorkspaceWithSecrets } from "@/lib/workspaces/registry";
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
import { createAdminClient } from "@/lib/supabase/admin";
import { mintGatewayToken } from "@/lib/gateways/mint-token";
import { buildGatewayOneLiner } from "@/lib/gateways/one-liner";
import { dockerAvailable, startLocalGateway, localGatewayStatus } from "@/lib/gateways/local-compose";
import { runCompleteSetup } from "@/lib/setup/run-complete-setup";
import { parseSupabaseUrl } from "@/lib/workspaces/parse-url";

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

// ─── Existing actions (kept) ────────────────────────────────────────────

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

// ─── One-click migration for new workspaces ────────────────────────────

export interface OneClickMigrationResult extends ActionResult {
  applied?: number;
  skipped?: number;
}

const oneClickSchema = z.object({
  projectRef: z.string().min(1),
  region: z.string().min(1),
  dbPassword: z.string().min(1),
});

export async function runNewWorkspaceOneClickMigration(
  input: z.infer<typeof oneClickSchema>,
): Promise<OneClickMigrationResult> {
  const parsed = oneClickSchema.safeParse(input);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path[0]).filter(Boolean);
    return { ok: false, error: `Missing required fields: ${missing.join(", ") || "region, password, project ref"}.` };
  }

  const { projectRef, region, dbPassword } = parsed.data;
  const encodedPassword = encodeURIComponent(dbPassword);
  const { runMigrations } = await import("@/lib/workspaces/run-migrations");

  const poolerPrefixes = ["aws-0", "aws-1", "aws-2"];

  for (const prefix of poolerPrefixes) {
    const connectionString =
      `postgresql://postgres.${projectRef}:${encodedPassword}@${prefix}-${region}.pooler.supabase.com:5432/postgres`;
    try {
      const result = await runMigrations({
        connectionString,
        onProgress: () => {},
      });

      if (result.errors.length > 0) {
        const first = result.errors[0];
        return {
          ok: false,
          error: `Migration failed on ${first.name}: ${first.error}`,
          applied: result.applied.length,
          skipped: result.skipped.length,
        };
      }

      return {
        ok: true,
        applied: result.applied.length,
        skipped: result.skipped.length,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("password authentication failed")) {
        return {
          ok: false,
          error: "Incorrect database password.",
          hint: "This is the password you set when creating the Supabase project, not your Supabase account password.",
        };
      }
      if (msg.includes("Tenant") || msg.includes("ENOTFOUND")) {
        continue;
      }
      return { ok: false, error: msg };
    }
  }

  return {
    ok: false,
    error: "Could not connect to the database.",
    hint: "Check that the region matches where you created your Supabase project, and that the project isn't paused.",
  };
}

export async function extractProjectRefFromUrl(supabaseUrl: string): Promise<string | null> {
  const r = parseSupabaseUrl(supabaseUrl);
  if (!r.ok || !r.ref) return null;
  return r.ref;
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
    emoji: input.emoji || "\u{1F3E0}",
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

// ─── (a) Register new workspace DB ──────────────────────────────────────

export async function registerNewWorkspaceDb(input: {
  label: string;
  emoji: string;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = dbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid database credentials" };
  }

  const workspace = await addWorkspace({
    label: input.label || "My Workspace",
    emoji: input.emoji || "\u{1F3E0}",
    url: parsed.data.url,
    anonKey: parsed.data.anonKey,
    serviceRoleKey: parsed.data.serviceRoleKey,
    makeDefault: false,
  });

  const jar = await cookies();
  jar.set(ACTIVE_WORKSPACE_COOKIE, workspace.id, ACTIVE_WORKSPACE_COOKIE_OPTIONS);

  return { ok: true, data: { workspaceId: workspace.id } };
}

// ─── (b) Mint gateway token ─────────────────────────────────────────────

export async function mintNewWorkspaceGatewayToken(input?: {
  label?: string;
}): Promise<ActionResult<{ oneLiner: string; tokenId: string; expiresAt: string }>> {
  try {
    const jar = await cookies();
    const hint = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
    const workspace = await getActiveWorkspaceWithSecrets(hint);
    if (!workspace) {
      return { ok: false, error: "No workspace configured yet. Connect a database first." };
    }

    const label = (input?.label ?? "Gateway").trim() || "Gateway";
    const minted = await mintGatewayToken({ label });

    const oneLiner = buildGatewayOneLiner({
      token: minted.token,
      label,
      project: workspace,
    });

    return {
      ok: true,
      data: {
        oneLiner,
        tokenId: minted.tokenId,
        expiresAt: minted.expiresAt,
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ─── (c) Poll for gateway heartbeat ─────────────────────────────────────

export async function pollNewWorkspaceGateway(): Promise<
  ActionResult<{ status: "ready" | "pending"; gatewayId?: string }>
> {
  try {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("gateways")
      .select("id, status, last_seen_at, last_heartbeat_at")
      .neq("status", "error")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data?.id && data.last_seen_at) {
      const seenAge = Date.now() - new Date(data.last_seen_at as string).getTime();
      const heartbeatAt = data.last_heartbeat_at as string | null;
      const heartbeatAge = heartbeatAt
        ? Date.now() - new Date(heartbeatAt).getTime()
        : Infinity;
      if (seenAge < 120_000 && heartbeatAge < 120_000) {
        return { ok: true, data: { status: "ready", gatewayId: data.id as string } };
      }
    }
  } catch {
    // fall through
  }

  const status = await localGatewayStatus();
  if (status.running) {
    return { ok: true, data: { status: "ready" } };
  }

  return { ok: true, data: { status: "pending" } };
}

// ─── (d) Start local gateway ────────────────────────────────────────────

export async function startLocalNewWorkspaceGateway(): Promise<ActionResult> {
  const available = await dockerAvailable();
  if (!available) {
    return {
      ok: false,
      error: "Could not talk to Docker.",
      hint:
        "Make sure Docker is running and /var/run/docker.sock is accessible. " +
        "You can also start the gateway manually: `docker compose --profile gateway up -d`",
    };
  }

  const result = await startLocalGateway();
  if (!result.ok) {
    return {
      ok: false,
      error: `Docker compose failed: ${result.stderr || result.stdout}`.slice(0, 400),
    };
  }

  return { ok: true };
}

// ─── (e) Provider OAuth actions (no onboarding guard) ───────────────────

const PROVIDER_VALIDATION_ENDPOINTS: Record<string, { url: string; method?: string; headers: (key: string) => Record<string, string>; body?: string; authStatuses: number[] }> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }),
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
    authStatuses: [401, 403],
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: (key) => ({ "x-goog-api-key": key }),
    authStatuses: [400, 401, 403],
  },
  openrouter: {
    url: "https://openrouter.ai/api/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
  deepseek: {
    url: "https://api.deepseek.com/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
  mistral: {
    url: "https://api.mistral.ai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
  groq: {
    url: "https://api.groq.com/openai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
  xai: {
    url: "https://api.x.ai/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
  together: {
    url: "https://api.together.xyz/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
  fireworks: {
    url: "https://api.fireworks.ai/inference/v1/models",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    authStatuses: [401, 403],
  },
};

const SKIP_VALIDATION_PROVIDERS = new Set([
  "ollama", "lmstudio", "vllm", "sglang",
]);

const OAUTH_PROVIDERS = new Set([
  "openai-codex", "github-copilot", "google-gemini-cli", "minimax-portal",
]);

export async function connectNewWorkspaceProvider(
  provider: string,
  apiKey: string,
): Promise<ActionResult> {
  if (SKIP_VALIDATION_PROVIDERS.has(provider) || OAUTH_PROVIDERS.has(provider)) {
    return { ok: true };
  }

  const validation = PROVIDER_VALIDATION_ENDPOINTS[provider];
  if (validation) {
    try {
      const res = await fetch(validation.url, {
        method: validation.method ?? "GET",
        headers: validation.headers(apiKey),
        ...(validation.body ? { body: validation.body } : {}),
      });
      if (validation.authStatuses.includes(res.status)) {
        return { ok: false, error: "Invalid API key" };
      }
    } catch {
      return { ok: false, error: "Could not reach the provider API" };
    }
  }

  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from("agent_commands")
      .insert({
        gateway_id: gw?.id ?? null,
        action: "auth_set_api_key",
        payload: { provider, api_key: apiKey },
      });

    if (error) {
      return { ok: false, error: error.message };
    }

    await supabase.from("agent_commands").insert({
      gateway_id: gw?.id ?? null,
      action: "auth_list",
      payload: {},
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save provider",
    };
  }

  return { ok: true };
}

export async function startNewWorkspaceOAuth(
  provider: string,
  mode: "oauth_paste" | "device_code",
): Promise<ActionResult<{ commandId: string }>> {
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const { data: cmd, error } = await supabase
      .from("agent_commands")
      .insert({
        gateway_id: gw?.id ?? null,
        action: "auth_start",
        payload: { provider, profile_name: "default", mode },
      })
      .select("id")
      .single();

    if (error || !cmd) {
      return { ok: false, error: error?.message ?? "Failed to start sign-in" };
    }
    return { ok: true, data: { commandId: cmd.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to start sign-in",
    };
  }
}

export async function submitNewWorkspaceOAuthPaste(
  parentCommandId: string,
  value: string,
): Promise<ActionResult> {
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase
      .from("agent_commands")
      .insert({
        gateway_id: gw?.id ?? null,
        action: "auth_paste",
        payload: { parent_command_id: parentCommandId, value },
      });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to submit code",
    };
  }
}

export async function pollNewWorkspaceCommandState(
  commandId: string,
): Promise<ActionResult<{ status: string; payload: Record<string, unknown> }>> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("agent_commands")
    .select("status, payload, error_message")
    .eq("id", commandId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Command not found" };
  return {
    ok: true,
    data: {
      status: data.status,
      payload: {
        ...(data.payload as Record<string, unknown>),
        error_message: data.error_message,
      },
    },
  };
}

export async function saveNewWorkspaceOAuthProvider(
  provider: string,
): Promise<ActionResult> {
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();

    await supabase.from("agent_commands").insert({
      gateway_id: gw?.id ?? null,
      action: "auth_list",
      payload: {},
    });
  } catch {
    // Non-critical
  }

  return { ok: true };
}

// ─── (f) Create agent ───────────────────────────────────────────────────

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  anthropic: "anthropic/claude-sonnet-4-20250514",
  openai: "openai/gpt-4.1",
  "openai-codex": "openai/gpt-4.1",
  google: "google/gemini-2.5-flash",
  "google-gemini-cli": "google/gemini-2.5-flash",
  ollama: "ollama/llama3.3",
  lmstudio: "lmstudio/default",
  vllm: "vllm/default",
  sglang: "sglang/default",
};

export async function createNewWorkspaceAgent(input: {
  agentName: string;
  agentSlug?: string;
  agentEmoji: string;
  templateBranch: string;
  providerId?: string;
}): Promise<ActionResult<{ agentId: string; provisionCommandId?: string }>> {
  const slug = (input.agentSlug ?? input.agentName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "agent";

  try {
    const supabase = await createAdminClient();

    const { data: wsRow } = await supabase
      .from("workspace")
      .select("slug, owner_name, owner_preferred_name, owner_timezone")
      .limit(1)
      .maybeSingle();

    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();

    const meta = {
      emoji: input.agentEmoji || undefined,
      template_branch: input.templateBranch,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("agents")
      .insert({
        name: input.agentName,
        slug,
        gateway_id: gw?.id ?? null,
        meta,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return { ok: false, error: insertError?.message ?? "Failed to create agent" };
    }

    const agentId = inserted.id;

    const { data: cmd, error: cmdError } = await supabase
      .from("agent_commands")
      .insert({
        agent_id: agentId,
        agent_slug: slug,
        gateway_id: gw?.id ?? null,
        action: "provision",
        payload: {
          source_template: input.templateBranch,
          channel: "none",
          name: input.agentName,
          emoji: input.agentEmoji,
          model: input.providerId ? PROVIDER_DEFAULT_MODELS[input.providerId] : undefined,
          owner_name: wsRow?.owner_name,
          owner_preferred_name: wsRow?.owner_preferred_name,
          owner_timezone: wsRow?.owner_timezone,
        },
      })
      .select("id")
      .single();

    if (cmdError || !cmd) {
      return { ok: false, error: cmdError?.message ?? "Failed to enqueue provision" };
    }

    return { ok: true, data: { agentId, provisionCommandId: cmd.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create agent",
    };
  }
}

export async function pollNewWorkspaceAgentProvision(
  commandId: string,
): Promise<"pending" | "completed" | "error"> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("agent_commands")
    .select("status")
    .eq("id", commandId)
    .maybeSingle();

  if (!data) return "pending";
  if (data.status === "done") return "completed";
  if (data.status === "error" || data.status === "failed") return "error";
  return "pending";
}

// ─── (g) Finalize new workspace ─────────────────────────────────────────

export async function finalizeNewWorkspace(input: {
  email: string;
  password: string;
  contextPresetKey?: string | null;
  workspaceName: string;
  workspaceSlug?: string | null;
  ownerName?: string;
}): Promise<ActionResult> {
  const jar = await cookies();
  const hint = jar.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const workspace = await getActiveWorkspaceWithSecrets(hint);
  if (!workspace) {
    return { ok: false, error: "No workspace configured. Connect a database first." };
  }

  const userResult = await createAuthUser({
    url: workspace.url,
    serviceRoleKey: workspace.serviceRoleKey,
    email: input.email,
    password: input.password,
  });

  if (!userResult.ok && !userResult.error?.includes("already exists")) {
    return { ok: false, error: userResult.error ?? "Failed to create account" };
  }

  const supabase = await createAdminClient();
  const result = await runCompleteSetup(supabase, {
    workspaceName: input.workspaceName,
    workspaceSlug: input.workspaceSlug,
    ownerName: input.ownerName,
    contextPresetKey: input.contextPresetKey,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true };
}
