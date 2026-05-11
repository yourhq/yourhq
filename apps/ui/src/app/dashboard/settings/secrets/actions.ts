"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/secrets/crypto";
import { deriveKeyFromName } from "@/lib/secrets/utils";
import type { Secret, AgentSecretView, SecretCategory } from "@/lib/secrets/types";

interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const SECRET_COLUMNS =
  "id, created_at, updated_at, gateway_id, agent_id, key, name, category, note, sync_status, last_synced_at";

export async function listSecretsForGateway(
  gatewayId: string,
): Promise<ActionResult<{ secrets: Secret[] }>> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("secrets")
    .select(SECRET_COLUMNS)
    .eq("gateway_id", gatewayId)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { secrets: (data ?? []) as Secret[] } };
}

export async function listSecretsForAgent(
  agentId: string,
  gatewayId: string,
): Promise<ActionResult<{ secrets: AgentSecretView[] }>> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const supabase = await createAdminClient();

  const { data, error } = await supabase
    .from("secrets")
    .select(SECRET_COLUMNS)
    .eq("gateway_id", gatewayId)
    .or(`agent_id.eq.${agentId},agent_id.is.null`)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };

  const secrets: AgentSecretView[] = (data ?? []).map((row) => ({
    ...(row as Secret),
    scope: row.agent_id === agentId ? ("agent" as const) : ("gateway" as const),
  }));

  return { ok: true, data: { secrets } };
}

export interface CreateSecretInput {
  gatewayId: string;
  agentId?: string | null;
  name: string;
  key: string;
  value: string;
  category?: SecretCategory;
  note?: string;
}

export async function createSecret(
  input: CreateSecretInput,
): Promise<ActionResult<{ secret: Secret }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!input.value) return { ok: false, error: "Value is required." };

  const key = input.key || deriveKeyFromName(input.name);
  if (!KEY_PATTERN.test(key)) {
    return {
      ok: false,
      error: "Variable name must start with a letter and contain only A-Z, 0-9, and underscores.",
    };
  }

  const encrypted = await encryptSecret(input.value);

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("secrets")
    .insert({
      gateway_id: input.gatewayId,
      agent_id: input.agentId || null,
      key,
      name: input.name.trim(),
      encrypted_value: encrypted,
      category: input.category ?? "user",
      note: input.note?.trim() || null,
      sync_status: "pending",
    })
    .select(SECRET_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `A secret with the variable name "${key}" already exists in this scope.` };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, data: { secret: data as Secret } };
}

export async function updateSecretValue(
  secretId: string,
  newValue: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  if (!newValue) return { ok: false, error: "Value is required." };

  const encrypted = await encryptSecret(newValue);

  const admin = await createAdminClient();
  const { error } = await admin
    .from("secrets")
    .update({ encrypted_value: encrypted, sync_status: "pending" })
    .eq("id", secretId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateSecretNote(
  secretId: string,
  note: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const admin = await createAdminClient();
  const { error } = await admin
    .from("secrets")
    .update({ note: note?.trim() || null })
    .eq("id", secretId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteSecret(secretId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const admin = await createAdminClient();
  const { error } = await admin.from("secrets").delete().eq("id", secretId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

