"use server";

import { z } from "zod";
import {
  patchOnboardingState,
  getActiveProjectWithSecrets,
} from "@/lib/projects/registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateSupabaseCreds } from "@/lib/projects/validate";
import {
  saveWelcome,
  saveContext,
  saveGatewaySetup,
  startLocalGatewayAction,
  mintGatewayTokenAction,
  advanceAfterGateway,
  type ActionResult,
} from "@/app/onboarding/actions";
import {
  createAgentWithBranch,
  enqueueAgentCommand,
} from "@/app/dashboard/agents/actions";

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

export async function validateAndConnectDb(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<ActionResult> {
  const parsed = dbSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check that URL and both keys are filled in." };
  }

  const validation = await validateSupabaseCreds(parsed.data);
  if (!validation.ok) {
    return { ok: false, error: validation.error ?? "Connection failed" };
  }

  await patchOnboardingState({
    data: {
      supabaseUrl: parsed.data.url,
      supabaseAnonKey: parsed.data.anonKey,
    },
  });
  return { ok: true };
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

export async function connectProvider(
  provider: string,
  apiKey: string,
): Promise<ActionResult> {
  // For Ollama, no key needed — just record the choice
  if (provider === "ollama") {
    await patchOnboardingState({ data: { providerId: "ollama" } });
    return { ok: true };
  }

  // Validate the key by making a test call
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        return { ok: false, error: "Invalid OpenAI API key" };
      }
    } else if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      // 200 or 400 (bad request with valid auth) both confirm the key works
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Invalid Anthropic API key" };
      }
    }
  } catch {
    return { ok: false, error: "Could not reach the provider API" };
  }

  // Fire the auth_set_api_key command on the gateway
  try {
    const r = await enqueueAgentCommand({
      action: "auth_set_api_key" as any,
      payload: { provider, api_key: apiKey },
    });
    await patchOnboardingState({
      data: { providerId: provider, providerCommandId: r.commandId },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save provider",
    };
  }

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
    const result = await createAgentWithBranch({
      name: input.name,
      slug,
      emoji: input.emoji,
      templateBranch: input.templateBranch,
    });

    // Enqueue provision command
    const cmd = await enqueueAgentCommand({
      agentId: result.agentId,
      action: "provision",
      payload: {
        source_branch: input.templateBranch,
        owner_name: result.ownerName,
        owner_preferred_name: result.ownerPreferredName,
        owner_timezone: result.ownerTimezone,
      },
    });

    await patchOnboardingState({
      data: {
        agentId: result.agentId,
        agentSlug: result.slug,
        agentName: input.name,
      },
    });

    return { ok: true, data: { agentId: result.agentId, provisionCommandId: cmd.commandId } };
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
  if (data.status === "completed") return "completed";
  if (data.status === "error" || data.status === "failed") return "error";
  return "pending";
}
