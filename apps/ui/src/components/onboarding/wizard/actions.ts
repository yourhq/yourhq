"use server";

import { z } from "zod";
import { patchOnboardingState, addProject, getActiveProject } from "@/lib/projects/registry";
import { cookies } from "next/headers";
import { ACTIVE_PROJECT_COOKIE, ACTIVE_PROJECT_COOKIE_OPTIONS } from "@/lib/projects/cookie";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateSupabaseCreds } from "@/lib/projects/validate";
import {
  saveWelcome,
  saveContext,
  saveGatewaySetup,
  startLocalGatewayAction,
  mintGatewayTokenAction,
  advanceAfterGateway,
  prepareSchemaInstallAction,
  runOneClickMigrationAction,
  confirmSchemaInstalledAction,
  type ActionResult,
} from "@/app/onboarding/actions";

export { prepareSchemaInstallAction, runOneClickMigrationAction, confirmSchemaInstalledAction };

// ─── Welcome ──────────────────────────────────────────────────────────────

export async function saveWelcomeStep(input: {
  ownerName: string;
  preferredName: string;
  workspaceName: string;
  workspaceSlug: string;
}): Promise<ActionResult> {
  const r = await saveWelcome({
    ownerName: input.ownerName,
    preferredName: input.preferredName,
    emoji: "👋",
  });
  if (!r.ok) return r;

  await patchOnboardingState({
    data: {
      workspaceName: input.workspaceName,
      workspaceLabel: input.workspaceName,
      workspaceSlug: input.workspaceSlug,
    },
  });
  return { ok: true };
}

// ─── Intent ───────────────────────────────────────────────────────────────

export async function saveIntentStep(intentKey: string): Promise<ActionResult> {
  return saveContext({ presetKey: intentKey });
}

// ─── Infrastructure (OSS) ─────────────────────────────────────────────────

const dbSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(20),
  serviceRoleKey: z.string().min(20),
});

export interface ValidateDbResult extends ActionResult {
  schemaNeeded?: boolean;
  projectRef?: string | null;
  sqlEditorUrl?: string;
}

export async function validateAndConnectDb(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ValidateDbResult> {
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

  await patchOnboardingState({
    data: {
      supabaseUrl: parsed.data.url,
      supabaseAnonKey: parsed.data.anonKey,
    },
  });

  if (schemaMissing) {
    return { ok: true, schemaNeeded: true };
  }

  // Schema is present — save the project to the registry so the gateway
  // step can look it up via getActiveProjectWithSecrets().
  await saveProjectToRegistry(parsed.data);

  return { ok: true, schemaNeeded: false };
}

export async function saveProjectToRegistry(creds: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}) {
  const existing = await getActiveProject();
  if (existing?.url === creds.url) return;

  const project = await addProject({
    label: "My workspace",
    emoji: "🏠",
    url: creds.url,
    anonKey: creds.anonKey,
    serviceRoleKey: creds.serviceRoleKey,
    makeDefault: true,
  });

  const jar = await cookies();
  jar.set(ACTIVE_PROJECT_COOKIE, project.id, ACTIVE_PROJECT_COOKIE_OPTIONS);

  await patchOnboardingState({ data: { projectId: project.id } });
}

export async function setupGateway(
  placement: "local" | "remote",
): Promise<ActionResult> {
  await saveGatewaySetup({ placement });

  if (placement === "local") {
    const r = await startLocalGatewayAction();
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true };
  }

  // Remote: mint token — the caller handles polling
  const r = await mintGatewayTokenAction({ label: "Gateway" });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

export async function advanceInfrastructure(): Promise<ActionResult> {
  return advanceAfterGateway();
}

// ─── Provider ─────────────────────────────────────────────────────────────

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

// Providers that don't need API key validation during onboarding
const SKIP_VALIDATION_PROVIDERS = new Set([
  "ollama", "lmstudio", "vllm", "sglang", // local
]);

const OAUTH_PROVIDERS = new Set([
  "openai-codex", "github-copilot", "google-gemini-cli", "minimax-portal",
]);

export async function connectProvider(
  provider: string,
  apiKey: string,
): Promise<ActionResult> {
  // Local and OAuth providers — just record the choice (OAuth auth already
  // happened via the inline startOAuthFlow / InteractivePhase)
  if (SKIP_VALIDATION_PROVIDERS.has(provider) || OAUTH_PROVIDERS.has(provider)) {
    await patchOnboardingState({ data: { providerId: provider } });
    return { ok: true };
  }

  // Validate the key if we have an endpoint for this provider
  const validation = PROVIDER_VALIDATION_ENDPOINTS[provider];
  if (validation) {
    try {
      const res = await fetch(validation.url, {
        method: validation.method ?? "GET",
        headers: validation.headers(apiKey),
        ...(validation.body ? { body: validation.body } : {}),
      });
      if (validation.authStatuses.includes(res.status)) {
        return { ok: false, error: `Invalid API key` };
      }
    } catch {
      return { ok: false, error: "Could not reach the provider API" };
    }
  }

  // Fire the auth_set_api_key command on the gateway (admin client —
  // no user session exists yet during onboarding)
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();

    const { data: cmd, error } = await supabase
      .from("agent_commands")
      .insert({
        gateway_id: gw?.id ?? null,
        action: "auth_set_api_key",
        payload: { provider, api_key: apiKey },
      })
      .select("id")
      .single();

    if (error || !cmd) {
      return { ok: false, error: error?.message ?? "Failed to save provider" };
    }

    await patchOnboardingState({
      data: { providerId: provider, providerCommandId: cmd.id },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save provider",
    };
  }

  return { ok: true };
}

// ─── OAuth flow ──────────────────────────────────────────────────────────

export async function startOAuthFlow(
  provider: string,
  mode: "oauth_paste" | "device_code",
): Promise<ActionResult<{ commandId: string }>> {
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
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

export async function submitOAuthPaste(
  parentCommandId: string,
  value: string,
): Promise<ActionResult> {
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
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

export async function pollCommandState(
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

export async function saveOAuthProvider(provider: string): Promise<ActionResult> {
  await patchOnboardingState({ data: { providerId: provider } });
  return { ok: true };
}

// ─── Agent ────────────────────────────────────────────────────────────────

export async function createFirstAgent(input: {
  name: string;
  emoji: string;
  templateBranch: string;
}): Promise<ActionResult<{ agentId: string; provisionCommandId?: string }>> {
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "agent";

  try {
    const supabase = await createAdminClient();

    // Workspace info for branch naming and owner profile
    const { data: wsRow } = await supabase
      .from("workspace")
      .select("slug, owner_name, owner_preferred_name, owner_timezone")
      .limit(1)
      .maybeSingle();
    const _wsSlug = (wsRow?.slug as string | null) ?? null;

    // Default gateway
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();

    const meta = {
      emoji: input.emoji || undefined,
      template_branch: input.templateBranch,
      channel: "telegram" as const,
      telegram_token_env: `TELEGRAM_TOKEN_${slug.toUpperCase().replace(/-/g, "_")}`,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("agents")
      .insert({
        name: input.name,
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

    // Enqueue provision command
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

    await patchOnboardingState({
      data: { agentId, agentSlug: slug, agentName: input.name },
    });

    return { ok: true, data: { agentId, provisionCommandId: cmd.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create agent",
    };
  }
}

// ─── Provision polling ────────────────────────────────────────────────────

export async function pollAgentProvisionStatus(
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

// ─── Channel connection ──────────────────────────────────────────────────

export async function connectChannelAction(input: {
  agentId: string;
  agentSlug: string;
  channel: string;
  token: string;
  extras?: Record<string, string>;
}): Promise<ActionResult<{ provisionCommandId: string }>> {
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      channel: input.channel,
    };
    if (input.channel === "telegram") {
      payload.telegram_token = input.token;
    } else if (input.channel === "discord") {
      payload.discord_token = input.token;
      if (input.extras?.discord_server_id) payload.discord_server_id = input.extras.discord_server_id;
      if (input.extras?.discord_user_id) payload.discord_user_id = input.extras.discord_user_id;
    } else if (input.channel === "slack") {
      payload.slack_app_token = input.token;
      if (input.extras?.slack_bot_token) payload.slack_bot_token = input.extras.slack_bot_token;
    }

    const { data: cmd, error } = await supabase
      .from("agent_commands")
      .insert({
        agent_id: input.agentId,
        agent_slug: input.agentSlug,
        gateway_id: gw?.id ?? null,
        action: "provision",
        payload,
      })
      .select("id")
      .single();

    if (error || !cmd) {
      return { ok: false, error: error?.message ?? "Failed to connect channel" };
    }

    // Update agent meta with the channel info
    const metaUpdate: Record<string, unknown> = { channel: input.channel };
    if (input.channel === "telegram") {
      metaUpdate.telegram_token_env = `TELEGRAM_TOKEN_${input.agentSlug.toUpperCase().replace(/-/g, "_")}`;
    }
    await supabase
      .from("agents")
      .update({ meta: metaUpdate })
      .eq("id", input.agentId);

    return { ok: true, data: { provisionCommandId: cmd.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to connect channel",
    };
  }
}

// ─── Pairing ─────────────────────────────────────────────────────────────

export async function submitPairingAction(input: {
  agentId: string;
  agentSlug: string;
  channel: string;
  pairingCode: string;
}): Promise<ActionResult> {
  try {
    const supabase = await createAdminClient();
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();

    const { data: cmd, error } = await supabase
      .from("agent_commands")
      .insert({
        agent_id: input.agentId,
        agent_slug: input.agentSlug,
        gateway_id: gw?.id ?? null,
        action: "approve_pairing",
        payload: {
          pairing_code: input.pairingCode,
          channel: input.channel,
        },
      })
      .select("id")
      .single();

    if (error || !cmd) {
      return { ok: false, error: error?.message ?? "Failed to submit pairing code" };
    }

    // Poll for completion (up to 15 seconds)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data: status } = await supabase
        .from("agent_commands")
        .select("status, error_message")
        .eq("id", cmd.id)
        .maybeSingle();
      if (status?.status === "done") return { ok: true };
      if (status?.status === "failed" || status?.status === "error") {
        return { ok: false, error: (status.error_message as string) ?? "Pairing failed" };
      }
    }

    return { ok: false, error: "Pairing timed out — try again" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to submit pairing code",
    };
  }
}

// ─── Account creation + finalize ─────────────────────────────────────────

export async function createAccountAndFinalize(input: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const {
    createAuthUserAction,
    finalizeOnboarding,
  } = await import("@/app/onboarding/actions");

  const userResult = await createAuthUserAction({
    authEmail: input.email,
    authPassword: input.password,
  });

  if (!userResult.ok) {
    if (userResult.alreadyExists) {
      // User already exists — that's fine, just finalize
    } else {
      return { ok: false, error: userResult.error };
    }
  }

  const finalizeResult = await finalizeOnboarding();
  if (!finalizeResult.ok) {
    return { ok: false, error: finalizeResult.error };
  }

  return { ok: true };
}
