"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { HQPlugin, PluginEventLog } from "@/lib/plugins/types";

interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

const PLUGIN_COLUMNS =
  "id, created_at, updated_at, plugin_id, name, description, version, source, is_enabled, hooks, entry_module, webhook_url, config, config_schema, capabilities, installed_by, meta";

const EVENT_COLUMNS =
  "id, created_at, plugin_id, hook, entity_type, entity_id, status, duration_ms, error_message";

export async function listPlugins(): Promise<
  ActionResult<{ plugins: HQPlugin[] }>
> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("hq_plugins")
    .select(PLUGIN_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { plugins: (data ?? []) as HQPlugin[] } };
}

export interface CreateWebhookPluginInput {
  name: string;
  description?: string;
  webhookUrl: string;
  webhookSecret?: string;
  hooks: string[];
}

export async function createWebhookPlugin(
  input: CreateWebhookPluginInput,
): Promise<ActionResult<{ plugin: HQPlugin }>> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!input.webhookUrl.trim())
    return { ok: false, error: "Webhook URL is required." };
  if (input.hooks.length === 0)
    return { ok: false, error: "Select at least one event." };

  try {
    new URL(input.webhookUrl);
  } catch {
    return { ok: false, error: "Invalid webhook URL." };
  }

  const pluginId = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (!pluginId) return { ok: false, error: "Name must contain letters or numbers." };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("hq_plugins")
    .insert({
      plugin_id: pluginId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      source: "webhook",
      hooks: input.hooks,
      webhook_url: input.webhookUrl.trim(),
      webhook_secret: input.webhookSecret?.trim() || null,
      installed_by: user.id,
    })
    .select(PLUGIN_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: `A plugin with the ID "${pluginId}" already exists.`,
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, data: { plugin: data as HQPlugin } };
}

export async function updatePluginConfig(
  pluginId: string,
  config: Record<string, unknown>,
): Promise<ActionResult> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("hq_plugins")
    .update({ config })
    .eq("id", pluginId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function togglePlugin(
  pluginId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("hq_plugins")
    .update({ is_enabled: enabled })
    .eq("id", pluginId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePlugin(pluginId: string): Promise<ActionResult> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const supabase = await createAdminClient();

  const { data: plugin } = await supabase
    .from("hq_plugins")
    .select("source")
    .eq("id", pluginId)
    .single();

  if (plugin?.source === "builtin") {
    return { ok: false, error: "Built-in plugins cannot be removed." };
  }

  const { error } = await supabase
    .from("hq_plugins")
    .delete()
    .eq("id", pluginId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listPluginEvents(
  pluginId: string,
  limit = 50,
): Promise<ActionResult<{ events: PluginEventLog[] }>> {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("hq_plugin_events")
    .select(EVENT_COLUMNS)
    .eq("plugin_id", pluginId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { events: (data ?? []) as PluginEventLog[] } };
}
