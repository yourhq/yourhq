"use server";

import { createClient } from "@/lib/supabase/server";
import {
  branchExists,
  createBranch,
  deleteBranch,
  getDefaultBranch,
  getFileContent,
  saveFile,
} from "@/lib/github/client";
import type { AgentManifest, AgentMeta, CommandAction } from "@/lib/agents/types";
import { AGENT_COMMAND_ACTIONS, SYSTEM_COMMAND_ACTIONS } from "@/lib/agents/types";
import type { Workspace } from "@/lib/workspace/types";

export interface CreateAgentInput {
  name: string;
  slug: string;
  emoji?: string;
  description?: string;
  templateBranch: string | null;
  // Collected for future secure storage; intentionally not persisted yet.
  telegramToken?: string;
}

export interface CreateAgentResult {
  agentId: string;
  slug: string;
  branch: string;
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  const description = input.description?.trim() ?? "";
  const emoji = input.emoji?.trim() || undefined;

  if (!name) throw new Error("Name is required");
  const slugErr = validateSlug(slug);
  if (slugErr) throw new Error(slugErr);

  // Fetch workspace slug for branch prefix.
  const { data: wsRow } = await supabase
    .from("workspace")
    .select("slug")
    .limit(1)
    .maybeSingle();
  const wsSlug = (wsRow?.slug as string | null) ?? null;
  const branchName = wsSlug ? `${wsSlug}/${slug}` : slug;

  // Uniqueness: check GitHub branch + DB row in parallel.
  const [branchTaken, existingAgent] = await Promise.all([
    branchExists(branchName),
    supabase.from("agents").select("id").eq("slug", slug).maybeSingle(),
  ]);
  if (branchTaken) throw new Error(`Branch "${branchName}" already exists`);
  if (existingAgent.data) throw new Error(`Agent with slug "${slug}" already exists`);

  const baseBranch = input.templateBranch ?? (await getDefaultBranch());
  const tokenEnvVar = `TELEGRAM_TOKEN_${slug.toUpperCase().replace(/-/g, "_")}`;

  // 1. Create the branch.
  await createBranch(branchName, baseBranch);

  try {
    // 2. Read + patch agent.json on the new branch.
    const file = await getFileContent(branchName, "agent.json");
    const manifest = JSON.parse(file.content) as AgentManifest;

    const patched: AgentManifest = {
      ...manifest,
      slug,
      name,
      description,
      telegram_token_env: tokenEnvVar,
    };
    if (emoji) patched.emoji = emoji;

    const nextContent = JSON.stringify(patched, null, 2) + "\n";
    await saveFile(
      branchName,
      "agent.json",
      nextContent,
      file.sha,
      `feat: initialize agent ${slug}`
    );

    // 3. Populate USER.md with workspace profile if available.
    const { data: profileRow } = await supabase
      .from("workspace")
      .select("owner_name, owner_preferred_name, owner_timezone")
      .limit(1)
      .maybeSingle();

    if (profileRow) {
      const ws = profileRow as Pick<Workspace, "owner_name" | "owner_preferred_name" | "owner_timezone">;
      try {
        const userMd = await getFileContent(branchName, "USER.md");
        let content = userMd.content;
        let changed = false;

        if (ws.owner_name && content.includes("USER_NAME_HERE")) {
          content = content.replaceAll("USER_NAME_HERE", ws.owner_name);
          changed = true;
        }
        if (ws.owner_preferred_name && content.includes("PREFERRED_NAME_HERE")) {
          content = content.replaceAll("PREFERRED_NAME_HERE", ws.owner_preferred_name);
          changed = true;
        }
        if (ws.owner_timezone && content.includes("TIMEZONE_HERE")) {
          content = content.replaceAll("TIMEZONE_HERE", ws.owner_timezone);
          changed = true;
        }

        if (changed) {
          await saveFile(
            branchName,
            "USER.md",
            content,
            userMd.sha,
            `feat: populate USER.md for ${slug}`
          );
        }
      } catch (e) {
        // USER.md might not exist in the template — non-fatal.
        console.warn("[createAgentWithBranch] Could not populate USER.md:", e);
      }
    }

    // 3b. Patch IDENTITY.md — replace the template's `## Name` (and `## Emoji`)
    //     section bodies with the user-chosen values. Other sections (Role,
    //     Archetype, Vibe, Creature, etc.) are left intact so the template's
    //     character survives.
    try {
      const identity = await getFileContent(branchName, "IDENTITY.md");
      let content = identity.content;
      let changed = false;

      const replaceSection = (body: string, heading: string, value: string) => {
        const re = new RegExp(
          `(^|\\n)(##\\s+${heading}\\s*\\n)([\\s\\S]*?)(?=\\n##\\s|\\s*$)`,
          "i"
        );
        if (!re.test(body)) return { body, changed: false };
        return {
          body: body.replace(re, (_m, lead, head) => `${lead}${head}${value}\n`),
          changed: true,
        };
      };

      const nameResult = replaceSection(content, "Name", name);
      if (nameResult.changed) {
        content = nameResult.body;
        changed = true;
      }

      if (emoji) {
        const emojiResult = replaceSection(content, "Emoji", emoji);
        if (emojiResult.changed) {
          content = emojiResult.body;
          changed = true;
        }
      }

      if (changed) {
        await saveFile(
          branchName,
          "IDENTITY.md",
          content,
          identity.sha,
          `feat: set IDENTITY.md name for ${slug}`
        );
      }
    } catch (e) {
      // IDENTITY.md might not exist in every template — non-fatal.
      console.warn("[createAgentWithBranch] Could not populate IDENTITY.md:", e);
    }

    // 4. Insert DB row. Inherit domains/capabilities from manifest so the
    //    dashboard row matches the branch.
    const meta: AgentMeta = {
      emoji,
      team: manifest.team || undefined,
      template_branch: input.templateBranch,
      telegram_token_env: tokenEnvVar,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("agents")
      .insert({
        name,
        slug,
        description: description || null,
        domains: manifest.domains ?? [],
        capabilities: manifest.capabilities ?? [],
        meta,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Failed to insert agent row");
    }

    // 5. Audit (best-effort).
    await supabase.from("audit_log").insert({
      actor_type: "human",
      module: "agents",
      entity_type: "agent",
      entity_id: inserted.id,
      action: "created",
      summary: `Registered agent '${name}' from ${
        input.templateBranch ?? "custom"
      }`,
    });

    return { agentId: inserted.id, slug, branch: branchName };
  } catch (e) {
    // Rollback: delete the branch we just created so the slug is free to retry.
    await deleteBranch(branchName).catch((rollbackErr) => {
      console.error("[createAgentWithBranch] Rollback failed:", rollbackErr);
    });
    throw e;
  }
}

// ── Agent Command Queue ──────────────────────────────────────

export interface EnqueueCommandInput {
  agentId?: string;
  agentSlug?: string;
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
