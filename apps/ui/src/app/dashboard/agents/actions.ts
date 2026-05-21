"use server";

import { createClient } from "@/lib/supabase/server";
import { BUNDLED_TEMPLATES } from "@/generated/templates";
import type { AgentChannel, AgentMeta, CommandAction } from "@/lib/agents/types";
import { AGENT_COMMAND_ACTIONS, SYSTEM_COMMAND_ACTIONS } from "@/lib/agents/types";
import { getPostHogClient } from "@/lib/posthog-server";

export interface CreateAgentInput {
  name: string;
  slug: string;
  emoji?: string;
  description?: string;
  templateBranch: string | null;
  reportsToId?: string | null;
  gatewayId?: string;
  model?: string | null;
  thinking?: string | null;
  channel?: AgentChannel;
  discordServerId?: string;
  discordUserId?: string;
}

export interface CreateAgentResult {
  agentId: string;
  slug: string;
  branch: string;
  sourceBranch: string;
  gatewayId?: string;
  ownerName?: string;
  ownerPreferredName?: string;
  ownerTimezone?: string;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(["default", "main", "master", "new", "template"]);

function validateSlug(slug: string): string | null {
  if (!slug) return "Slug is required";
  if (slug.length < 2 || slug.length > 40) return "Slug must be 2–40 characters";
  if (!SLUG_RE.test(slug)) return "Slug must be lowercase letters, numbers, and hyphens";
  if (RESERVED_SLUGS.has(slug)) return `Slug "${slug}" is reserved`;
  if (slug.startsWith("template/") || slug.startsWith("template-")) {
    return "Slug cannot start with template";
  }
  return null;
}

export async function createAgentWithBranch(
  input: CreateAgentInput
): Promise<CreateAgentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const description = input.description?.trim() ?? "";
  const emoji = input.emoji?.trim() || undefined;

  if (!name) throw new Error("Name is required");
  const slugErr = validateSlug(slug);
  if (slugErr) throw new Error(slugErr);

  // Fetch workspace slug for branch prefix + owner profile for USER.md
  // population downstream in add-agent.sh.
  const { data: wsRow } = await supabase
    .from("workspace")
    .select("slug, owner_name, owner_preferred_name, owner_timezone")
    .limit(1)
    .maybeSingle();
  const wsSlug = (wsRow?.slug as string | null) ?? null;
  const branchName = wsSlug ? `${wsSlug}/${slug}` : slug;

  // DB uniqueness check. We can't check the gateway's local git repo for
  // branch uniqueness from here — add-agent.sh will no-op if the branch
  // already exists, so we rely on the slug uniqueness in the DB as our
  // real guard.
  const { data: existingAgent } = await supabase
    .from("agents")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingAgent) throw new Error(`Agent with slug "${slug}" already exists`);

  const channel = input.channel ?? "telegram";
  const sourceTemplate = input.templateBranch ?? "default";

  // Resolve template metadata from the baked list so we can seed
  // domains/capabilities/team on the agents row. Falls back to empty
  // when sourceTemplate is "default" (or unknown).
  const templateMeta = BUNDLED_TEMPLATES.find(
    (t) => t.branch === sourceTemplate
  );

  const meta: AgentMeta = {
    emoji,
    team: templateMeta?.team || undefined,
    template_branch: input.templateBranch,
    channel,
  };

  let gatewayId = input.gatewayId ?? null;
  if (!gatewayId) {
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();
    gatewayId = gw?.id ?? null;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("agents")
    .insert({
      name,
      slug,
      description: description || null,
      domains: templateMeta?.domains ?? [],
      capabilities: templateMeta?.capabilities ?? [],
      reports_to_id: input.reportsToId ?? null,
      gateway_id: gatewayId,
      model: input.model ?? null,
      thinking: input.thinking ?? null,
      meta,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Failed to insert agent row");
  }

  // Audit (best-effort).
  await supabase.from("audit_log").insert({
    actor_type: "human",
    module: "agents",
    entity_type: "agent",
    entity_id: inserted.id,
    action: "created",
    summary: `Registered agent '${name}' from ${input.templateBranch ?? "custom"}`,
  });

  getPostHogClient()?.capture({
    distinctId: user.id,
    event: "agent_created",
    properties: {
      agent_id: inserted.id,
      agent_slug: slug,
      template_branch: input.templateBranch ?? "custom",
      channel,
    },
  });

  // Stash the owner profile on the result so the wizard can pass it into
  // the provision command payload.
  return {
    agentId: inserted.id,
    slug,
    branch: branchName,
    sourceBranch: sourceTemplate,
    gatewayId: gatewayId ?? undefined,
    ownerName: wsRow?.owner_name ?? undefined,
    ownerPreferredName: wsRow?.owner_preferred_name ?? undefined,
    ownerTimezone: wsRow?.owner_timezone ?? undefined,
  };
}

// ── Delete Agent ────────────────────────────────────────────────

export async function deleteAgentAction(agentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, slug")
    .eq("id", agentId)
    .single();
  if (!agent) throw new Error("Agent not found");

  const { error } = await supabase.from("agents").delete().eq("id", agentId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    actor_type: "human",
    module: "agents",
    entity_type: "agent",
    entity_id: agentId,
    action: "deleted",
    summary: `Deleted agent '${agent.name}'`,
  });

  getPostHogClient()?.capture({
    distinctId: user.id,
    event: "agent_deleted",
    properties: { agent_id: agentId, agent_slug: agent.slug },
  });
}

// ── Agent Command Queue ──────────────────────────────────────

export interface EnqueueCommandInput {
  agentId?: string;
  agentSlug?: string;
  gatewayId?: string;
  action: CommandAction;
  payload?: Record<string, unknown>;
}

export interface EnqueueCommandResult {
  commandId: string;
}

const ALL_ACTIONS = [...AGENT_COMMAND_ACTIONS, ...SYSTEM_COMMAND_ACTIONS];

export async function enqueueAgentCommand(
  input: EnqueueCommandInput
): Promise<EnqueueCommandResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!ALL_ACTIONS.includes(input.action)) {
    throw new Error(`Unknown command action: ${input.action}`);
  }

  // Agent-scoped commands require an agent
  if (AGENT_COMMAND_ACTIONS.includes(input.action)) {
    if (!input.agentId) throw new Error("Agent ID is required for this command");

    const { data: agent } = await supabase
      .from("agents")
      .select("id, slug, name, description, gateway_id, meta")
      .eq("id", input.agentId)
      .single();
    if (!agent) throw new Error("Agent not found");

    // Use the agent's actual slug
    input.agentSlug = agent.slug;
    if (!input.gatewayId && agent.gateway_id) {
      input.gatewayId = agent.gateway_id;
    }

    if (input.action === "provision") {
      const p = (input.payload ?? {}) as Record<string, unknown>;
      if (!p.name && agent.name) p.name = agent.name;
      if (!p.description && agent.description) p.description = agent.description;
      const tb = (agent.meta as Record<string, unknown> | null)?.template_branch;
      if (!p.source_template && tb) p.source_template = tb;
      input.payload = p;
    }
  }

  // System commands without a specific gateway target the first available
  if (!input.gatewayId) {
    const { data: gw } = await supabase
      .from("gateways")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (gw) input.gatewayId = gw.id;
  }

  const { data: inserted, error } = await supabase
    .from("agent_commands")
    .insert({
      agent_id: input.agentId || null,
      agent_slug: input.agentSlug || null,
      gateway_id: input.gatewayId || null,
      action: input.action,
      payload: input.payload ?? {},
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message ?? "Failed to enqueue command");
  }

  // Audit log (best-effort)
  await supabase.from("audit_log").insert({
    actor_type: "human",
    module: "agents",
    entity_type: "agent_command",
    entity_id: inserted.id,
    action: "created",
    summary: `Enqueued ${input.action}${input.agentSlug ? ` for agent '${input.agentSlug}'` : ""}`,
  });

  getPostHogClient()?.capture({
    distinctId: user.id,
    event: "agent_command_enqueued",
    properties: {
      command_id: inserted.id,
      action: input.action,
      agent_id: input.agentId ?? null,
      agent_slug: input.agentSlug ?? null,
    },
  });

  return { commandId: inserted.id };
}

// ── Update Agent ────────────────────────────────────────────────

export interface UpdateAgentInput {
  agentId: string;
  name?: string;
  description?: string | null;
  domains?: string[];
  capabilities?: string[];
  reportsToId?: string | null;
  model?: string | null;
  thinking?: string | null;
}

export async function updateAgent(input: UpdateAgentInput): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: agent } = await supabase
    .from("agents")
    .select("id, slug, name")
    .eq("id", input.agentId)
    .single();
  if (!agent) throw new Error("Agent not found");

  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Name is required");
    updates.name = trimmed;
  }

  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }

  if (input.domains !== undefined) {
    updates.domains = input.domains;
  }

  if (input.capabilities !== undefined) {
    updates.capabilities = input.capabilities;
  }

  if (input.model !== undefined) {
    updates.model = input.model;
  }

  if (input.thinking !== undefined) {
    updates.thinking = input.thinking;
  }

  if (input.reportsToId !== undefined) {
    if (input.reportsToId === input.agentId) {
      throw new Error("An agent cannot report to itself");
    }

    if (input.reportsToId) {
      const { data: chain } = await supabase.rpc("agent_reports_chain", {
        p_agent_id: input.reportsToId,
      });
      if (
        Array.isArray(chain) &&
        chain.some(
          (r: { agent_id: string }) => r.agent_id === input.agentId,
        )
      ) {
        throw new Error("This would create a circular reporting chain");
      }
    }

    updates.reports_to_id = input.reportsToId;
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("agents")
    .update(updates)
    .eq("id", input.agentId);
  if (error) throw new Error(error.message);

  const summaryParts: string[] = [];

  if (input.name !== undefined) {
    summaryParts.push(`Renamed '${agent.slug}' to '${input.name.trim()}'`);
  }

  if (input.description !== undefined) {
    summaryParts.push(`Updated description of '${agent.slug}'`);
  }

  if (input.domains !== undefined) {
    summaryParts.push(`Updated domains of '${agent.slug}'`);
  }

  if (input.capabilities !== undefined) {
    summaryParts.push(`Updated capabilities of '${agent.slug}'`);
  }

  if (input.reportsToId !== undefined) {
    let managerLabel = "Operator";
    if (input.reportsToId) {
      const { data: manager } = await supabase
        .from("agents")
        .select("slug")
        .eq("id", input.reportsToId)
        .single();
      if (manager) managerLabel = `'${manager.slug}'`;
    }
    summaryParts.push(
      input.reportsToId
        ? `Set manager of '${agent.slug}' to ${managerLabel}`
        : `Cleared manager of '${agent.slug}'`,
    );
  }

  if (input.model !== undefined) {
    summaryParts.push(
      input.model
        ? `Set model of '${agent.slug}' to ${input.model}`
        : `Cleared model for '${agent.slug}'`,
    );
  }

  if (input.thinking !== undefined) {
    summaryParts.push(
      input.thinking
        ? `Set thinking of '${agent.slug}' to ${input.thinking}`
        : `Cleared thinking for '${agent.slug}'`,
    );
  }

  if (summaryParts.length > 0) {
    await supabase.from("audit_log").insert({
      actor_type: "human",
      module: "agents",
      entity_type: "agent",
      entity_id: input.agentId,
      action: "updated",
      summary: summaryParts.join("; "),
    });
  }
}

export async function toggleAgentPauseAction(
  agentId: string,
  currentStatus: string,
): Promise<{ ok: boolean; newStatus: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, newStatus: currentStatus, error: "Unauthorized" };

  const newStatus = currentStatus === "paused" ? "ready" : "paused";
  const { error } = await supabase
    .from("agents")
    .update({ status: newStatus })
    .eq("id", agentId);

  if (error) return { ok: false, newStatus: currentStatus, error: error.message };

  const { data: agent } = await supabase
    .from("agents")
    .select("slug, name")
    .eq("id", agentId)
    .single();

  await supabase.from("audit_log").insert({
    actor_type: "human",
    module: "agents",
    entity_type: "agent",
    entity_id: agentId,
    action: "status_changed",
    summary: `${newStatus === "paused" ? "Paused" : "Resumed"} agent '${agent?.name ?? agentId}'`,
    changes: { status: { old: currentStatus, new: newStatus } },
  });

  return { ok: true, newStatus };
}

// ── Agent Skill Upsert ────────────────────────────────────────────────

export interface UpsertAgentSkillInput {
  agentId: string;
  title: string;
  content: string;
  action: "create" | "update";
  knowledgeItemId?: string;
  reason: string;
}

export async function upsertAgentSkill(
  input: UpsertAgentSkillInput
): Promise<{ id: string; action: "created" | "updated" }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, slug")
    .eq("id", input.agentId)
    .single();
  if (!agent) throw new Error("Agent not found");

  if (input.action === "create") {
    const { data: item, error } = await supabase
      .from("knowledge_items")
      .insert({
        kind: "skill",
        title: input.title.trim(),
        plain_text: input.content.trim(),
        scope: "agent",
      })
      .select("id")
      .single();

    if (error || !item) throw new Error(error?.message ?? "Failed to create skill");

    await supabase.from("knowledge_item_agents").insert({
      knowledge_item_id: item.id,
      agent_id: agent.id,
    });

    await supabase.from("audit_log").insert({
      actor_type: "human",
      module: "knowledge",
      entity_type: "knowledge_item",
      entity_id: item.id,
      action: "created",
      summary: input.reason?.trim() || `Created skill '${input.title.trim()}' for agent '${agent.name}'`,
    });

    return { id: item.id, action: "created" };
  }

  if (!input.knowledgeItemId) throw new Error("knowledgeItemId required for updates");

  const { error } = await supabase
    .from("knowledge_items")
    .update({
      title: input.title.trim(),
      plain_text: input.content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.knowledgeItemId);

  if (error) throw new Error(error.message);

  await supabase.from("audit_log").insert({
    actor_type: "human",
    module: "knowledge",
    entity_type: "knowledge_item",
    entity_id: input.knowledgeItemId,
    action: "updated",
    summary: input.reason?.trim() || `Updated skill '${input.title.trim()}' for agent '${agent.name}'`,
  });

  return { id: input.knowledgeItemId, action: "updated" };
}

// ── Connect Channel ────────────────────────────────────────────────────

export async function connectAgentChannel(input: {
  agentId: string;
  agentSlug: string;
  channel: "telegram" | "discord" | "slack";
  token: string;
  extras?: Record<string, string>;
}): Promise<{ ok: boolean; provisionCommandId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id, slug, name, gateway_id, meta")
    .eq("id", input.agentId)
    .single();
  if (!agent) return { ok: false, error: "Agent not found" };

  const gwId = agent.gateway_id;

  const { encryptSecret } = await import("@/lib/secrets/crypto");

  if (input.channel === "telegram" && input.token.trim()) {
    const encrypted = await encryptSecret(input.token.trim());
    await supabase.from("secrets").insert({
      gateway_id: gwId,
      agent_id: input.agentId,
      key: "TELEGRAM_BOT_TOKEN",
      name: "Telegram Bot Token",
      encrypted_value: encrypted,
      category: "channel",
      sync_status: "pending",
    });
  } else if (input.channel === "discord" && input.token.trim()) {
    const encrypted = await encryptSecret(input.token.trim());
    await supabase.from("secrets").insert({
      gateway_id: gwId,
      agent_id: input.agentId,
      key: "DISCORD_BOT_TOKEN",
      name: "Discord Bot Token",
      encrypted_value: encrypted,
      category: "channel",
      sync_status: "pending",
    });
  } else if (input.channel === "slack" && input.token.trim()) {
    const encrypted = await encryptSecret(input.token.trim());
    await supabase.from("secrets").insert({
      gateway_id: gwId,
      agent_id: input.agentId,
      key: "SLACK_APP_TOKEN",
      name: "Slack App Token",
      encrypted_value: encrypted,
      category: "channel",
      sync_status: "pending",
    });
    if (input.extras?.slack_bot_token?.trim()) {
      const encBot = await encryptSecret(input.extras.slack_bot_token.trim());
      await supabase.from("secrets").insert({
        gateway_id: gwId,
        agent_id: input.agentId,
        key: "SLACK_BOT_TOKEN",
        name: "Slack Bot Token",
        encrypted_value: encBot,
        category: "channel",
        sync_status: "pending",
      });
    }
  }

  const payload: Record<string, unknown> = { channel: input.channel };
  if (agent.name) payload.name = agent.name;
  const templateBranch = (agent.meta as Record<string, unknown> | null)?.template_branch;
  if (templateBranch) payload.source_template = templateBranch;
  if (input.channel === "discord") {
    if (input.extras?.discord_server_id) payload.discord_server_id = input.extras.discord_server_id;
    if (input.extras?.discord_user_id) payload.discord_user_id = input.extras.discord_user_id;
  }

  const { data: cmd, error } = await supabase
    .from("agent_commands")
    .insert({
      agent_id: input.agentId,
      agent_slug: agent.slug,
      gateway_id: gwId,
      action: "provision",
      payload,
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (error || !cmd) {
    return { ok: false, error: error?.message ?? "Failed to connect channel" };
  }

  const metaUpdate: Record<string, unknown> = { channel: input.channel };
  if (input.channel === "telegram") {
    metaUpdate.telegram_token_env = `TELEGRAM_TOKEN_${agent.slug.toUpperCase().replace(/-/g, "_")}`;
  }
  await supabase
    .from("agents")
    .update({ meta: metaUpdate })
    .eq("id", input.agentId);

  await supabase.from("agent_commands").insert({
    gateway_id: gwId,
    action: "restart_gateway",
    payload: {},
    requested_by: user.id,
  });

  getPostHogClient()?.capture({
    distinctId: user.id,
    event: "agent_channel_connected",
    properties: { agent_id: input.agentId, agent_slug: input.agentSlug, channel: input.channel },
  });

  return { ok: true, provisionCommandId: cmd.id };
}

export async function submitAgentPairing(input: {
  agentId: string;
  agentSlug: string;
  channel: string;
  pairingCode: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id, slug, gateway_id")
    .eq("id", input.agentId)
    .single();
  if (!agent) return { ok: false, error: "Agent not found" };

  const { data: cmd, error } = await supabase
    .from("agent_commands")
    .insert({
      agent_id: input.agentId,
      agent_slug: agent.slug,
      gateway_id: agent.gateway_id,
      action: "approve_pairing",
      payload: { pairing_code: input.pairingCode, channel: input.channel },
      requested_by: user.id,
    })
    .select("id")
    .single();

  if (error || !cmd) {
    return { ok: false, error: error?.message ?? "Failed to submit pairing code" };
  }

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 3000));
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

  const { data: final } = await supabase
    .from("agent_commands")
    .select("status")
    .eq("id", cmd.id)
    .maybeSingle();
  if (final?.status === "done" || final?.status === "running" || final?.status === "pending") {
    return { ok: true };
  }

  return { ok: false, error: "Pairing timed out" };
}

// ── Provision Polling ──────────────────────────────────────────────────

export async function pollProvisionStatus(
  commandId: string,
): Promise<"pending" | "completed" | "error"> {
  const supabase = await createClient();
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

// ── Set Agent Model + Thinking ─────────────────────────────────────────

export async function setAgentModelAction(
  agentId: string,
  model: string | null,
  thinking: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id, slug, gateway_id, model, thinking")
    .eq("id", agentId)
    .single();
  if (!agent) return { ok: false, error: "Agent not found" };

  const updates: Record<string, unknown> = {};
  if (model !== undefined) updates.model = model;
  if (thinking !== undefined) updates.thinking = thinking;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("agents")
      .update(updates)
      .eq("id", agentId);
    if (error) return { ok: false, error: error.message };
  }

  if (agent.gateway_id) {
    await supabase.from("agent_commands").insert({
      agent_id: agentId,
      agent_slug: agent.slug,
      gateway_id: agent.gateway_id,
      action: "set_agent_model",
      payload: { agent_slug: agent.slug, model, thinking },
      requested_by: user.id,
    });
  }

  await supabase.from("audit_log").insert({
    actor_type: "human",
    module: "agents",
    entity_type: "agent",
    entity_id: agentId,
    action: "updated",
    summary: `Updated model config for '${agent.slug}'${model ? ` → ${model}` : ""}${thinking ? ` (thinking: ${thinking})` : ""}`,
  });

  return { ok: true };
}
