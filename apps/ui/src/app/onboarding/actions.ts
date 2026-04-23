"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addProject,
  getActiveProject,
  patchOnboardingState,
  getOnboardingState,
} from "@/lib/projects/registry";
import {
  ACTIVE_PROJECT_COOKIE,
  ACTIVE_PROJECT_COOKIE_OPTIONS,
} from "@/lib/projects/cookie";
import { validateSupabaseCreds } from "@/lib/projects/validate";
import { installSchema } from "@/lib/projects/install-schema";
import { createAuthUser } from "@/lib/projects/create-user";
import { detectTailscale } from "@/lib/tailscale/detect";
import { mintGatewayToken, checkTokenConsumed } from "@/lib/gateways/mint-token";
import {
  dockerAvailable,
  startLocalGateway,
  localGatewayStatus,
} from "@/lib/gateways/local-compose";

export type OnboardingStep =
  | "welcome"
  | "placement"
  | "supabase"
  | "networking"
  | "gateway"
  | "workspace"
  | "profile"
  | "pipeline"
  | "fields"
  | "streams"
  | "first_agent"
  | "done";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  hint?: string;
  data?: T;
}

// ─── Welcome: capture name + emoji ──────────────────────────────────────

const welcomeSchema = z.object({
  ownerName: z.string().min(1).max(80),
  preferredName: z.string().max(40).optional(),
  emoji: z.string().min(1).max(8).default("👋"),
});

export async function saveWelcome(
  input: z.infer<typeof welcomeSchema>,
): Promise<ActionResult> {
  const parsed = welcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  await patchOnboardingState({
    step: "placement",
    data: {
      ownerName: parsed.data.ownerName.trim(),
      preferredName: (parsed.data.preferredName ?? parsed.data.ownerName).trim(),
      ownerEmoji: parsed.data.emoji,
    },
  });
  return { ok: true };
}

// ─── Placement: local vs. separate machine ──────────────────────────────

const placementSchema = z.object({
  placement: z.enum(["local", "remote"]),
});

export async function savePlacement(
  input: z.infer<typeof placementSchema>,
): Promise<ActionResult> {
  const parsed = placementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  await patchOnboardingState({
    step: "supabase",
    data: { placement: parsed.data.placement },
  });
  return { ok: true };
}

// ─── Supabase: sub-step actions ─────────────────────────────────────────
//
// The Supabase onboarding phase is a 4-step stepper instead of one big
// submit:
//
//   1. Validate   — probe the URL + keys, confirm we can reach Supabase
//   2. Install    — run 001_schema.sql via pg-meta (idempotent)
//   3. Create     — make the first Supabase Auth user
//   4. Save       — write creds to the registry + mark step complete
//
// Each step reports independently so a failure (e.g. "user already
// exists") doesn't roll back the ones that already succeeded. The UI
// shows per-step status, retry buttons, and optional skip (e.g. skip
// user creation if the user wants to reuse an existing account).

const credsSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(20),
  serviceRoleKey: z.string().min(20),
});

export interface ValidateResult extends ActionResult {
  schemaInstalled: boolean;
}

/** Step 1 — just checks the URL + keys are reachable. */
export async function validateSupabaseCredsAction(
  input: z.infer<typeof credsSchema>,
): Promise<ValidateResult> {
  const parsed = credsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check that URL + both keys are filled in.",
      schemaInstalled: false,
    };
  }

  const validation = await validateSupabaseCreds(parsed.data);
  const schemaMissing =
    !validation.ok && validation.error?.includes("workspace table") === true;

  if (!validation.ok && !schemaMissing) {
    return {
      ok: false,
      error: validation.error ?? "Validation failed",
      hint: validation.hint,
      schemaInstalled: false,
    };
  }

  return { ok: true, schemaInstalled: !schemaMissing };
}

export interface InstallSchemaResultAction extends ActionResult {
  sqlFallback?: string;
}

/** Step 2 — install the schema via pg-meta. Idempotent (CREATE IF NOT EXISTS). */
export async function installSchemaAction(
  input: z.infer<typeof credsSchema>,
): Promise<InstallSchemaResultAction> {
  const parsed = credsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Missing creds." };
  }

  const install = await installSchema({
    url: parsed.data.url,
    serviceRoleKey: parsed.data.serviceRoleKey,
  });
  if (!install.ok) {
    return {
      ok: false,
      error: install.error,
      hint: install.hint,
      sqlFallback: install.sqlFallback,
    };
  }
  return { ok: true };
}

const createUserInputSchema = credsSchema.extend({
  authEmail: z.string().email(),
  authPassword: z.string().min(6).max(128),
});

export interface CreateUserResult extends ActionResult {
  /** true when the error was "user already exists" — caller can offer
   * to skip this step rather than retry. */
  alreadyExists?: boolean;
}

/** Step 3 — create the Supabase Auth user. Can be skipped if it exists. */
export async function createAuthUserAction(
  input: z.infer<typeof createUserInputSchema>,
): Promise<CreateUserResult> {
  const parsed = createUserInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Missing email or password." };
  }
  const r = await createAuthUser({
    url: parsed.data.url,
    serviceRoleKey: parsed.data.serviceRoleKey,
    email: parsed.data.authEmail,
    password: parsed.data.authPassword,
  });
  if (r.ok) return { ok: true };

  const alreadyExists =
    r.error?.toLowerCase().includes("already") === true ||
    r.hint?.toLowerCase().includes("sign in instead") === true;

  return {
    ok: false,
    error: r.error,
    hint: r.hint,
    alreadyExists,
  };
}

const saveProjectInputSchema = credsSchema.extend({
  workspaceLabel: z.string().min(1).max(80),
  workspaceEmoji: z.string().min(1).max(8).default("🏠"),
  authEmail: z.string().email().optional(),
});

export interface SaveProjectResult extends ActionResult {
  projectId?: string;
}

/** Step 4 — write the project to the split-file registry + advance. */
export async function saveProjectAction(
  input: z.infer<typeof saveProjectInputSchema>,
): Promise<SaveProjectResult> {
  const parsed = saveProjectInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Missing workspace label or creds." };
  }

  const project = await addProject({
    label: parsed.data.workspaceLabel.trim(),
    emoji: parsed.data.workspaceEmoji,
    url: parsed.data.url,
    anonKey: parsed.data.anonKey,
    serviceRoleKey: parsed.data.serviceRoleKey,
    makeDefault: true,
  });

  const jar = await cookies();
  jar.set(ACTIVE_PROJECT_COOKIE, project.id, ACTIVE_PROJECT_COOKIE_OPTIONS);

  await patchOnboardingState({
    step: "networking",
    data: {
      projectId: project.id,
      supabaseUrl: parsed.data.url,
      authEmail: parsed.data.authEmail,
    },
  });

  return { ok: true, projectId: project.id };
}

// ─── Networking: detect Tailscale, advance ──────────────────────────────

export interface NetworkingStatus {
  installed: boolean;
  loggedIn: boolean;
  selfIp?: string;
  magicDnsName?: string;
  selfHostname?: string;
  error?: string;
}

export async function getNetworkingStatus(): Promise<NetworkingStatus> {
  const status = await detectTailscale();
  return {
    installed: status.installed,
    loggedIn: status.loggedIn,
    selfIp: status.selfIp,
    magicDnsName: status.magicDnsName,
    selfHostname: status.selfHostname,
    error: status.error,
  };
}

const networkingSchema = z.object({
  useTailscale: z.boolean(),
});

export async function saveNetworking(
  input: z.infer<typeof networkingSchema>,
): Promise<ActionResult> {
  const parsed = networkingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  await patchOnboardingState({
    step: "gateway",
    data: { useTailscale: parsed.data.useTailscale },
  });
  return { ok: true };
}

// ─── Gateway bootstrap ──────────────────────────────────────────────────

export interface GatewayBootstrap {
  placement: "local" | "remote";
  // Local: whether docker + compose is available in the UI container.
  dockerAvailable?: boolean;
  // Remote: token + one-liner the user runs on the target machine.
  token?: string;
  tokenId?: string;
  tokenExpiresAt?: string;
  oneLiner?: string;
  // Remote/Local: whether we've seen the gateway come online yet.
  gatewayOnline?: boolean;
  gatewayId?: string;
}

export async function startLocalGatewayAction(): Promise<ActionResult<GatewayBootstrap>> {
  const available = await dockerAvailable();
  if (!available) {
    return {
      ok: false,
      error: "Couldn't talk to Docker from the UI container.",
      hint:
        "Make sure /var/run/docker.sock is mounted in the UI container " +
        "(the installer does this automatically). You can also start the " +
        "gateway manually: `docker compose --profile gateway up -d`.",
    };
  }

  const result = await startLocalGateway();
  if (!result.ok) {
    return {
      ok: false,
      error: `Docker compose failed: ${result.stderr || result.stdout}`.slice(0, 400),
    };
  }

  return { ok: true, data: { placement: "local", dockerAvailable: true } };
}

export async function mintGatewayTokenAction(input: {
  label?: string;
}): Promise<ActionResult<GatewayBootstrap>> {
  const state = await getOnboardingState();
  const project = await getActiveProject(
    (state.data.projectId as string | undefined) ?? null,
  );
  if (!project) {
    return { ok: false, error: "No project configured yet." };
  }

  const label = (input.label ?? "Gateway").trim() || "Gateway";
  const minted = await mintGatewayToken({ label });

  // Build the one-liner. The remote install script fetches itself from
  // the raw GitHub URL so it works even when install.yourhq.ai hasn't
  // been set up yet — same approach as install.sh.
  const oneLiner = [
    "curl -fsSL https://raw.githubusercontent.com/yourhq/yourhq/main/installer/install-gateway.sh",
    `  | GATEWAY_TOKEN=${minted.token} \\`,
    `    SUPABASE_URL=${project.url} \\`,
    `    GATEWAY_LABEL=${JSON.stringify(label)} \\`,
    "    bash",
  ].join(" \\\n    ");

  await patchOnboardingState({
    data: {
      pendingTokenId: minted.tokenId,
      pendingTokenLabel: label,
    },
  });

  return {
    ok: true,
    data: {
      placement: "remote",
      token: minted.token,
      tokenId: minted.tokenId,
      tokenExpiresAt: minted.expiresAt,
      oneLiner,
    },
  };
}

export interface GatewayPollResult {
  status: "pending" | "online" | "expired";
  gatewayId?: string;
  dockerServices?: { name: string; state: string }[];
}

export async function pollLocalGateway(): Promise<GatewayPollResult> {
  // Primary signal: is there a gateway row in Supabase with a recent
  // heartbeat? That's the same thing a remote-gateway flow watches for.
  // Works whether the UI launched the compose profile itself OR the
  // user ran `docker compose --profile gateway up -d` manually.
  try {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("gateways")
      .select("id, status, last_seen_at")
      .neq("status", "offline")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      return { status: "online", gatewayId: data.id as string };
    }
  } catch {
    // no supabase yet, or RPC error — fall through to compose check
  }

  // Secondary signal: our own compose ps (only useful when the UI
  // container CAN reach the Docker socket).
  const status = await localGatewayStatus();
  return {
    status: status.running ? "online" : "pending",
    dockerServices: status.services,
  };
}

export async function pollRemoteGatewayToken(
  tokenId: string,
): Promise<GatewayPollResult> {
  const r = await checkTokenConsumed(tokenId);
  if ("consumed" in r && r.consumed) {
    return { status: "online", gatewayId: r.gatewayId };
  }
  if ("expired" in r && r.expired) {
    return { status: "expired" };
  }
  return { status: "pending" };
}

// ─── Advance past the gateway step once it's online ─────────────────────

export async function advanceAfterGateway(): Promise<ActionResult> {
  await patchOnboardingState({ step: "workspace" });
  revalidatePath("/onboarding");
  return { ok: true };
}

// ─── Setup wizard steps (merged from /setup) ────────────────────────────

const workspaceSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().max(60).optional(),
  description: z.string().max(500).optional(),
});

export async function saveWorkspaceStep(
  input: z.infer<typeof workspaceSchema>,
): Promise<ActionResult> {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  await patchOnboardingState({
    step: "pipeline",
    data: {
      workspaceName: parsed.data.name.trim(),
      workspaceSlug: parsed.data.slug?.trim() || null,
      workspaceDescription: parsed.data.description?.trim() || "",
    },
  });
  return { ok: true };
}

const pipelineSchema = z.object({
  pipelineKey: z.string().min(1),
});

export async function savePipelineStep(
  input: z.infer<typeof pipelineSchema>,
): Promise<ActionResult> {
  const parsed = pipelineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  await patchOnboardingState({
    step: "fields",
    data: { pipelineKey: parsed.data.pipelineKey },
  });
  return { ok: true };
}

const fieldsSchema = z.object({
  fieldKey: z.string().min(1),
});

export async function saveFieldsStep(
  input: z.infer<typeof fieldsSchema>,
): Promise<ActionResult> {
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  await patchOnboardingState({
    step: "streams",
    data: { fieldKey: parsed.data.fieldKey },
  });
  return { ok: true };
}

const streamsSchema = z.object({
  streamNames: z.array(z.string().min(1)),
});

export async function saveStreamsStep(
  input: z.infer<typeof streamsSchema>,
): Promise<ActionResult> {
  const parsed = streamsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  await patchOnboardingState({
    step: "first_agent",
    data: { streamNames: parsed.data.streamNames },
  });
  return { ok: true };
}

// ─── Finalize: call complete_setup RPC + mark onboarding done ───────────

import { createAdminClient } from "@/lib/supabase/admin";
import {
  PIPELINE_TEMPLATES,
  FIELD_TEMPLATES,
  DEFAULT_STREAMS,
} from "@/lib/setup/templates";

export async function finalizeOnboarding(): Promise<ActionResult> {
  const state = await getOnboardingState();
  const data = state.data as Record<string, unknown>;

  const workspaceName =
    (data.workspaceName as string | undefined) ??
    (data.ownerName as string | undefined) ??
    "Workspace";
  const workspaceSlug = (data.workspaceSlug as string | null | undefined) ?? null;
  const workspaceDescription =
    (data.workspaceDescription as string | undefined) ?? "";
  const ownerName = (data.ownerName as string | undefined) ?? "";
  const preferredName = (data.preferredName as string | undefined) ?? ownerName;
  const timezone = (data.timezone as string | undefined) ?? "";

  const pipelineKey = (data.pipelineKey as string | undefined) ?? "outreach";
  const fieldKey = (data.fieldKey as string | undefined) ?? "creator-outreach";
  const streamNames =
    (data.streamNames as string[] | undefined) ??
    DEFAULT_STREAMS.map((s) => s.name);

  const pipelineTemplate = PIPELINE_TEMPLATES.find((t) => t.key === pipelineKey);
  const fieldTemplate = FIELD_TEMPLATES.find((t) => t.key === fieldKey);
  if (!pipelineTemplate || !fieldTemplate) {
    return { ok: false, error: "Pipeline or field template not found" };
  }

  const enabledStreams = DEFAULT_STREAMS.filter((s) => streamNames.includes(s.name));
  const defaultNames = new Set(DEFAULT_STREAMS.map((s) => s.name));
  const customStreams = streamNames
    .filter((name) => !defaultNames.has(name))
    .map((name, i) => ({
      name,
      description: null,
      type: "custom" as const,
      color: "#6b7280",
      icon: null,
      sort_order: enabledStreams.length + i,
    }));
  const allStreams = [...enabledStreams, ...customStreams];

  const stagesJson = pipelineTemplate.stages.map((s) => ({
    stage_key: s.stage_key,
    label: s.label,
    color: s.color,
    sort_order: s.sort_order,
    is_terminal: s.is_terminal,
    is_default: s.is_default,
  }));

  const fieldsJson = fieldTemplate.fields.map((f) => ({
    field_key: f.field_key,
    field_type: f.field_type,
    label: f.label,
    field_group: f.field_group,
    sort_order: f.sort_order,
    required: f.required,
    options: f.options,
    description: f.description,
  }));

  const streamsJson = allStreams.map((s) => ({
    name: s.name,
    description: s.description,
    type: s.type,
    color: s.color,
    icon: s.icon,
    sort_order: s.sort_order,
  }));

  // Use the admin client — complete_setup needs service_role because
  // it writes to workspace, pipeline_stages, field_definitions, streams.
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("complete_setup", {
    p_name: workspaceName || "HQ",
    p_slug: workspaceSlug,
    p_description: workspaceDescription,
    p_owner_name: ownerName,
    p_preferred_name: preferredName,
    p_timezone: timezone,
    p_stages: stagesJson,
    p_fields: fieldsJson,
    p_streams: streamsJson,
  });
  if (error) return { ok: false, error: error.message };

  await patchOnboardingState({ step: "done", complete: true });
  revalidatePath("/");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { ok: true };
}
