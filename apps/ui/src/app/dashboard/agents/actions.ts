"use server";

import { createClient } from "@/lib/supabase/server";
import { BUNDLED_TEMPLATES } from "@/generated/templates";
import type { AgentMeta, CommandAction } from "@/lib/agents/types";
import { AGENT_COMMAND_ACTIONS, SYSTEM_COMMAND_ACTIONS } from "@/lib/agents/types";

export interface CreateAgentInput {
  name: string;
  slug: string;
  emoji?: string;
  description?: string;
  templateBranch: string | null;
  reportsToId?: string | null;
  // Collected for future secure storage; intentionally not persisted yet.
  telegramToken?: string;
}

export interface CreateAgentResult {
  agentId: string;
  slug: string;
  branch: string;
  sourceBranch: string;
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

  const tokenEnvVar = `TELEGRAM_TOKEN_${slug.toUpperCase().replace(/-/g, "_")}`;
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
    telegram_token_env: tokenEnvVar,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("agents")
    .insert({
      name,
      slug,
      description: description || null,
      domains: templateMeta?.domains ?? [],
      capabilities: templateMeta?.capabilities ?? [],
      reports_to_id: input.reportsToId ?? null,
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

  // Stash the owner profile on the result so the wizard can pass it into
  // the provision command payload.
  return {
    agentId: inserted.id,
    slug,
    branch: branchName,
    sourceBranch: sourceTemplate,
    ownerName: wsRow?.owner_name ?? undefined,
    ownerPreferredName: wsRow?.owner_preferred_name ?? undefined,
    ownerTimezone: wsRow?.owner_timezone ?? undefined,
  };
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
      .select("id, slug")
      .eq("id", input.agentId)
      .single();
    if (!agent) throw new Error("Agent not found");

    // Use the agent's actual slug
    input.agentSlug = agent.slug;
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

  return { commandId: inserted.id };
}

// ── Update Agent ────────────────────────────────────────────────

export interface UpdateAgentInput {
  agentId: string;
  reportsToId?: string | null;
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

  let managerLabel = "Operator";
  if (input.reportsToId) {
    const { data: manager } = await supabase
      .from("agents")
      .select("slug")
      .eq("id", input.reportsToId)
      .single();
    if (manager) managerLabel = `'${manager.slug}'`;
  }

  await supabase.from("audit_log").insert({
    actor_type: "human",
    module: "agents",
    entity_type: "agent",
    entity_id: input.agentId,
    action: "updated",
    summary: input.reportsToId
      ? `Set manager of '${agent.slug}' to ${managerLabel}`
      : `Cleared manager of '${agent.slug}'`,
  });
}
