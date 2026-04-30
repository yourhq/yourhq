"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addProject,
  getActiveProjectWithSecrets,
  patchOnboardingState,
  getOnboardingState,
} from "@/lib/projects/registry";
import { buildGatewayOneLiner } from "@/lib/gateways/one-liner";
import {
  ACTIVE_PROJECT_COOKIE,
  ACTIVE_PROJECT_COOKIE_OPTIONS,
} from "@/lib/projects/cookie";
import { validateSupabaseCreds } from "@/lib/projects/validate";
import { prepareSchemaInstall, verifySchemaInstalled } from "@/lib/projects/install-schema";
import { createAuthUser } from "@/lib/projects/create-user";
import { detectCollisions } from "@/lib/projects/detect-collisions";
import { parseSupabaseUrl, apiKeysDashboardUrl } from "@/lib/projects/parse-url";
import { detectTailscale } from "@/lib/tailscale/detect";
import { mintGatewayToken, checkTokenConsumed } from "@/lib/gateways/mint-token";
import {
  dockerAvailable,
  startLocalGateway,
  localGatewayStatus,
} from "@/lib/gateways/local-compose";

export type OnboardingStep =
  | "welcome"
  | "context"
  | "placement"
  | "supabase"
  | "account"
  | "networking"
  | "gateway"
  | "workspace"
  | "done"
  // Kept for backward compat with older persisted state.
  | "profile"
  | "pipeline"
  | "fields"
  | "streams"
  | "first_agent";

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
    step: "workspace",
    data: {
      ownerName: parsed.data.ownerName.trim(),
      preferredName: (parsed.data.preferredName ?? parsed.data.ownerName).trim(),
      ownerEmoji: parsed.data.emoji,
    },
  });
  return { ok: true };
}

// ─── Context: what will they use HQ for? ────────────────────────────────
//
// Picks a preset (pipeline + fields + streams). The onboarding wizard no
// longer asks separate picker screens for those — finalizeOnboarding
// reads the preset key and hydrates everything at the end.

const contextSchema = z.object({
  presetKey: z.string().min(1),
});

export async function saveContext(
  input: z.infer<typeof contextSchema>,
): Promise<ActionResult> {
  const parsed = contextSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  await patchOnboardingState({
    step: "supabase",
    data: { contextPresetKey: parsed.data.presetKey },
  });
  return { ok: true };
}

// ─── Placement: local vs. separate machine ──────────────────────────────
//
// savePlacement is kept for backward compat with persisted onboarding
// state from older builds. The new flow folds this into the Gateway step
// (see saveGatewaySetup below) — there's no longer a standalone
// placement screen.

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

// ─── Gateway placement (sub-phase of the Gateway step) ──────────────────
//
// Persists the user's placement choice (local vs. remote) without
// advancing the step — they're still on `gateway` while the bootstrap
// runs. The wizard reacts to the placement value to render the right
// sub-phase.

const gatewaySetupSchema = z.object({
  placement: z.enum(["local", "remote"]),
  tailscaleAuthKey: z.string().optional(),
});

export async function saveGatewaySetup(
  input: z.infer<typeof gatewaySetupSchema>,
): Promise<ActionResult> {
  const parsed = gatewaySetupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  await patchOnboardingState({
    data: {
      placement: parsed.data.placement,
      ...(parsed.data.tailscaleAuthKey
        ? { tailscaleAuthKey: parsed.data.tailscaleAuthKey }
        : {}),
    },
  });
  return { ok: true };
}

// Persists just the Tailscale auth key for the remote placement path.
// Empty string = "skip Tailscale" (user explicitly opted out). We
// distinguish from undefined (= not yet provided) so the wizard knows
// when to mint the registration token.
const tailscaleKeySchema = z.object({
  tailscaleAuthKey: z.string(), // empty allowed (= skipped)
});

export async function saveTailscaleAuthKey(
  input: z.infer<typeof tailscaleKeySchema>,
): Promise<ActionResult> {
  const parsed = tailscaleKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  await patchOnboardingState({
    data: { tailscaleAuthKey: parsed.data.tailscaleAuthKey },
  });
  return { ok: true };
}

// Resets gateway-related fields when the user clicks "Run on this/other
// machine instead." Cleared: placement + tailscaleAuthKey. Step stays
// on `gateway` so the placement picker re-renders.
export async function resetGatewayPlacement(): Promise<ActionResult> {
  await patchOnboardingState({
    data: {
      placement: undefined,
      tailscaleAuthKey: undefined,
    },
  });
  return { ok: true };
}

// Resets Supabase + downstream fields when the user clicks "Connect a
// different project" on the Supabase summary. Clears the entire
// auth-and-gateway chain so the user has to re-do them against the
// new project.
export async function resetSupabaseConnection(): Promise<ActionResult> {
  await patchOnboardingState({
    step: "supabase",
    data: {
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      projectId: undefined,
      authEmail: undefined,
      authMode: undefined,
      placement: undefined,
      tailscaleAuthKey: undefined,
    },
  });
  return { ok: true };
}

// ─── Supabase: sub-step actions ─────────────────────────────────────────
//
// The Supabase onboarding phase happens in three UI sub-screens:
//
//   brief    — explainer: what Supabase is, link to create a project
//   url      — single input: paste your project URL, we validate format
//              and resolve the project ref so we can deep-link to keys
//   keys     — paste anon + service role; we deep-link straight to the
//              specific page in their Supabase project that has them
//   provision — automated stepper:
//                 1. Check connection
//                 2. Detect collisions (existing app in this project?)
//                 3. Install schema (skipped if already installed)
//                 4. Save workspace to registry
//
// Account creation is a separate later screen so the user understands
// "this is my login," not "yet another form."

// ── Step: validate URL only (project ref extraction) ─────────────────

const urlOnlySchema = z.object({
  url: z.string().min(1),
});

export interface ValidateUrlResult extends ActionResult {
  url?: string;
  ref?: string;
  isCloudHosted?: boolean;
  apiKeysUrl?: string | null;
}

export async function validateProjectUrl(
  input: z.infer<typeof urlOnlySchema>,
): Promise<ValidateUrlResult> {
  const parsed = urlOnlySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Project URL is required." };
  }

  const r = parseSupabaseUrl(parsed.data.url);
  if (!r.ok) {
    return { ok: false, error: r.error ?? "Invalid URL." };
  }
  return {
    ok: true,
    url: r.url,
    ref: r.ref,
    isCloudHosted: r.isCloudHosted,
    apiKeysUrl: apiKeysDashboardUrl(r.ref),
  };
}

const credsSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(20),
  serviceRoleKey: z.string().min(20),
});

export interface ValidateResult extends ActionResult {
  schemaInstalled: boolean;
  // If we detected a non-HQ app already living in `public`, return what
  // we found. The UI surfaces a "use a separate project" + "install
  // anyway" path.
  collisionTables?: string[];
}

/** Step 1 — confirm the keys reach Supabase + detect schema state. */
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

  // Collision check: do they have an existing app in this project that
  // would clash with HQ's tables?
  if (schemaMissing) {
    const collisions = await detectCollisions({
      url: parsed.data.url,
      serviceRoleKey: parsed.data.serviceRoleKey,
    });
    if (collisions.status === "conflict") {
      return {
        ok: false,
        error:
          "This Supabase project has tables that conflict with HQ.",
        hint:
          `Found ${collisions.conflicts.join(", ")} with different shapes than HQ expects. ` +
          "Installing here would either fail or break your existing app.",
        schemaInstalled: false,
        collisionTables: collisions.conflicts,
      };
    }
  }

  return { ok: true, schemaInstalled: !schemaMissing };
}

export interface PrepareSchemaInstallResult extends ActionResult {
  sql?: string;
  sqlEditorUrl?: string;
  projectRef?: string | null;
}

/**
 * Step 2a — prepare the schema migration.
 *
 * Cloud Supabase doesn't expose any HTTP endpoint that runs arbitrary
 * SQL with just a service_role key, so we hand back the SQL + a
 * deep-link to the user's SQL editor. The UI opens the link in a new
 * tab, the user clicks Run, then comes back and we re-verify via
 * `confirmSchemaInstalledAction`.
 */
export async function prepareSchemaInstallAction(
  input: z.infer<typeof credsSchema>,
): Promise<PrepareSchemaInstallResult> {
  console.log("[prepareSchemaInstallAction] called");
  const parsed = credsSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      "[prepareSchemaInstallAction] zod validation failed:",
      JSON.stringify(parsed.error.flatten()),
    );
    return { ok: false, error: "Missing creds." };
  }

  try {
    const r = await prepareSchemaInstall({
      url: parsed.data.url,
      serviceRoleKey: parsed.data.serviceRoleKey,
    });
    if (!r.ok) {
      console.error(`[prepareSchemaInstallAction] failed: ${r.error}`);
      return { ok: false, error: r.error, hint: r.hint };
    }
    return {
      ok: true,
      sql: r.sql,
      sqlEditorUrl: r.sqlEditorUrl,
      projectRef: r.projectRef,
    };
  } catch (err) {
    console.error("[prepareSchemaInstallAction] threw:", err);
    return { ok: false, error: (err as Error).message };
  }
}

// ── One-click migration via direct Postgres connection ──────────────

const oneClickSchema = z.object({
  url: z.string().url(),
  serviceRoleKey: z.string().min(20),
  dbPassword: z.string().min(1),
});

export interface OneClickMigrationResult extends ActionResult {
  applied?: number;
  skipped?: number;
}

export async function runOneClickMigrationAction(
  input: z.infer<typeof oneClickSchema>,
): Promise<OneClickMigrationResult> {
  const parsed = oneClickSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Missing database password or credentials." };
  }

  let projectRef: string | null = null;
  try {
    const u = new URL(parsed.data.url);
    const m = u.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    projectRef = m ? m[1] : null;
  } catch {}

  let connectionString: string;
  if (projectRef) {
    connectionString = `postgres://postgres:${encodeURIComponent(parsed.data.dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
  } else {
    try {
      const u = new URL(parsed.data.url);
      connectionString = `postgres://postgres:${encodeURIComponent(parsed.data.dbPassword)}@${u.hostname}:5432/postgres`;
    } catch {
      return { ok: false, error: "Could not parse database host from URL." };
    }
  }

  try {
    const { runMigrations, discoverMigrations } = await import(
      "@/lib/projects/run-migrations"
    );

    const result = await runMigrations({
      connectionString,
      onProgress: (msg) => console.log(`[one-click] ${msg}`),
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
    if (msg.includes("ECONNREFUSED") || msg.includes("timeout")) {
      return {
        ok: false,
        error: "Could not connect to the database.",
        hint:
          "Cloud Supabase may block direct connections on port 5432 if your plan doesn't support it, " +
          "or the password may be incorrect. You can skip this and use the SQL editor instead.",
      };
    }
    if (msg.includes("password authentication failed")) {
      return {
        ok: false,
        error: "Incorrect database password.",
        hint: "This is the password you set when creating the Supabase project, not your Supabase account password.",
      };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Step 2b — confirm the user actually ran the SQL.
 *
 * Probes the `workspace` table via REST. Returns ok if the migration
 * landed, error otherwise (so the UI can keep them on the "did you run
 * it?" step).
 */
export async function confirmSchemaInstalledAction(
  input: z.infer<typeof credsSchema>,
): Promise<ActionResult> {
  console.log("[confirmSchemaInstalledAction] called");
  const parsed = credsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Missing creds." };
  const ok = await verifySchemaInstalled({
    url: parsed.data.url,
    serviceRoleKey: parsed.data.serviceRoleKey,
  });
  if (ok) {
    console.log("[confirmSchemaInstalledAction] schema verified");
    return { ok: true };
  }
  console.warn("[confirmSchemaInstalledAction] workspace table not found yet");
  return {
    ok: false,
    error: "We don't see the workspace table yet.",
    hint:
      "Make sure you clicked Run in the Supabase SQL editor — there should be a green " +
      "“Success. No rows returned.” message at the bottom.",
  };
}

// Caller-supplied creds are optional after the project is saved — at
// that point we can resolve url + serviceRoleKey from the registry.
const createUserInputSchema = z.object({
  url: z.string().url().optional(),
  anonKey: z.string().optional(),
  serviceRoleKey: z.string().optional(),
  authEmail: z.string().email(),
  authPassword: z.string().min(6).max(128),
});

export interface CreateUserResult extends ActionResult {
  /** true when the error was "user already exists" — caller can offer
   * to skip this step rather than retry. */
  alreadyExists?: boolean;
}

/** Create the Supabase Auth user. */
export async function createAuthUserAction(
  input: z.infer<typeof createUserInputSchema>,
): Promise<CreateUserResult> {
  console.log("[createAuthUserAction] called");
  const parsed = createUserInputSchema.safeParse(input);
  if (!parsed.success) {
    console.error(
      "[createAuthUserAction] zod failed:",
      JSON.stringify(parsed.error.flatten()),
    );
    return { ok: false, error: "Missing email or password." };
  }

  // If creds weren't supplied, look them up from the registry (the
  // common case: the project is already saved, the StepAccount component
  // doesn't need to round-trip the service_role_key from the browser).
  let url = parsed.data.url;
  let serviceRoleKey = parsed.data.serviceRoleKey;
  let credsSource = "form";
  if (!url || !serviceRoleKey) {
    const { getActiveProjectWithSecrets } = await import("@/lib/projects/registry");
    const project = await getActiveProjectWithSecrets();
    if (!project) {
      console.error(
        "[createAuthUserAction] no active project in registry and form didn't supply creds",
      );
      return {
        ok: false,
        error: "No project configured — connect Supabase first.",
      };
    }
    // `||` (not `??`): the form sends empty strings rather than undefined
    // when StepAccount doesn't have these values; treat empty as missing.
    url = url || project.url;
    serviceRoleKey = serviceRoleKey || project.serviceRoleKey;
    credsSource = "registry";
  }
  console.log(
    `[createAuthUserAction] creds from ${credsSource}: url=${url} ` +
      `key prefix=${serviceRoleKey.slice(0, 12)}… (length=${serviceRoleKey.length})`,
  );

  const r = await createAuthUser({
    url,
    serviceRoleKey,
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
    step: "account",
    data: {
      projectId: project.id,
      supabaseUrl: parsed.data.url,
      authEmail: parsed.data.authEmail,
    },
  });

  return { ok: true, projectId: project.id };
}

// ─── Account step ──────────────────────────────────────────────────────
//
// After Supabase is provisioned, the user creates (or signs in to) the
// auth account that lets them use HQ. The action just persists "we
// finished the account step" — the actual email + password handling
// happens client-side via the browser Supabase client (auto-sign-in).

const accountDoneSchema = z.object({
  email: z.string().email(),
  // Whether this was a fresh create or a sign-in to existing.
  mode: z.enum(["created", "signed_in"]).default("created"),
});

export async function markAccountDone(
  input: z.infer<typeof accountDoneSchema>,
): Promise<ActionResult> {
  const parsed = accountDoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  await patchOnboardingState({
    step: "gateway",
    data: {
      authEmail: parsed.data.email,
      authMode: parsed.data.mode,
    },
  });
  return { ok: true };
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
  // Optional Tailscale auth key. When present, embedded into the
  // remote-install one-liner so the gateway joins the user's tailnet
  // on first boot.
  tailscaleAuthKey?: string;
}): Promise<ActionResult<GatewayBootstrap>> {
  const state = await getOnboardingState();
  const projectId = (state.data.projectId as string | undefined) ?? null;
  const projectWithSecrets = await getActiveProjectWithSecrets(projectId);
  if (!projectWithSecrets) {
    return { ok: false, error: "No project configured yet." };
  }

  const label = (input.label ?? "Gateway").trim() || "Gateway";
  const minted = await mintGatewayToken({ label });

  const oneLiner = buildGatewayOneLiner({
    token: minted.token,
    label,
    project: projectWithSecrets,
    tailscaleAuthKey: input.tailscaleAuthKey,
  });

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
  status: "pending" | "ready" | "expired";
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
      .neq("status", "error")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      return { status: "ready", gatewayId: data.id as string };
    }
  } catch {
    // no supabase yet, or RPC error — fall through to compose check
  }

  // Secondary signal: our own compose ps (only useful when the UI
  // container CAN reach the Docker socket).
  const status = await localGatewayStatus();
  return {
    status: status.running ? "ready" : "pending",
    dockerServices: status.services,
  };
}

export async function pollRemoteGatewayToken(
  tokenId: string,
): Promise<GatewayPollResult> {
  const r = await checkTokenConsumed(tokenId);
  if ("consumed" in r && r.consumed) {
    return { status: "ready", gatewayId: r.gatewayId };
  }
  if ("expired" in r && r.expired) {
    return { status: "expired" };
  }
  return { status: "pending" };
}

// ─── Advance past the gateway step → finalize → done ────────────────────
//
// Workspace identity was captured back at step 2; gateway is the last
// piece of plumbing. Run finalizeOnboarding here so by the time the
// Done screen lands, complete_setup has already populated the workspace
// row, pipeline stages, fields, and streams.

export async function advanceAfterGateway(): Promise<ActionResult> {
  const fin = await finalizeOnboarding();
  if (!fin.ok) return fin;
  revalidatePath("/onboarding");
  return { ok: true };
}

// ─── Workspace step (runs early — captures name + emoji + slug) ─────────

const workspaceSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().max(60).optional(),
  description: z.string().max(500).optional(),
});

// Workspace identity is captured early — right after Welcome — and
// advances to the Context tile picker. The label flows through the
// rest of the flow (Supabase project label, Account screen header,
// dashboard title) without being asked twice.
export async function saveWorkspaceStep(
  input: z.infer<typeof workspaceSchema>,
): Promise<ActionResult> {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  await patchOnboardingState({
    step: "context",
    data: {
      workspaceName: parsed.data.name.trim(),
      // The "label" that surfaces in the project switcher mirrors the
      // workspace name; users don't think about them as different things.
      workspaceLabel: parsed.data.name.trim(),
      workspaceSlug: parsed.data.slug?.trim() || null,
      workspaceDescription: parsed.data.description?.trim() || "",
    },
  });
  return { ok: true };
}

// ─── Finalize: call complete_setup RPC + mark onboarding done ───────────

import { createAdminClient } from "@/lib/supabase/admin";
import {
  PIPELINE_TEMPLATES,
  FIELD_TEMPLATES,
  DEFAULT_STREAMS,
  CONTEXT_PRESETS,
  DEFAULT_CONTEXT_PRESET,
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

  // Resolve the context preset — chosen on the "what will you use HQ for?"
  // screen. Drives pipeline, fields, and streams in one shot.
  const presetKey = (data.contextPresetKey as string | undefined) ?? null;
  const preset =
    CONTEXT_PRESETS.find((p) => p.key === presetKey) ?? DEFAULT_CONTEXT_PRESET;

  const pipelineKey = preset.pipelineKey;
  const fieldKey = preset.fieldKey;
  const streamNames = preset.streamNames;

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
