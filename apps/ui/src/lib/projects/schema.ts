// Zod schemas for the project registry. Validated on every read so a
// hand-edited or corrupted file fails loudly instead of crashing with
// a cryptic undefined-is-not-a-function 10 call frames deep.

import { z } from "zod";

// ── Public registry (/config/projects.json) ─────────────────────────────
//
// Everything in here is safe to serve to the browser: URL, anon key,
// labels. Never includes the service role key — that lives in secrets.json.

// Where the UI is reachable from. The browser's allowed-origins list
// derives from this — a tailnet address, a custom domain, localhost, etc.
// Phase 2 lets the user add/remove these from Settings → Networking.
export const uiOriginSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(40).optional(),
  kind: z.enum(["localhost", "lan", "tailnet", "public", "custom"]).default("custom"),
});
export type UiOrigin = z.infer<typeof uiOriginSchema>;

export const publicProjectSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8),
  url: z.string().url(),
  anonKey: z.string().min(20),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
  // Added in later Phase 2 work; optional for backward compat with older
  // registries. Empty array means "accept only the default localhost origin."
  uiOrigins: z.array(uiOriginSchema).optional().default([]),
});

// Onboarding state — resumable multi-step wizard. Written incrementally
// to the registry so a closed tab or browser crash doesn't lose progress.
// Once complete === true, the wizard stops redirecting to /onboarding.
export const onboardingStateSchema = z.object({
  version: z.literal(1),
  step: z.enum([
    "welcome",
    "context",
    "placement",
    "supabase",
    "account",
    "networking",
    "gateway",
    "workspace",
    // Legacy steps — kept so stored onboarding state from older builds
    // still deserializes. These get skipped in the new flow but the enum
    // must accept them to avoid a zod parse error.
    "profile",
    "pipeline",
    "fields",
    "streams",
    "first_agent",
    "done",
  ]).default("welcome"),
  complete: z.boolean().default(false),
  // Free-form data we persist across steps. Zod'd loosely because the
  // wizard keeps adding fields and we don't want a schema change every time.
  data: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().datetime(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export const publicRegistrySchema = z.object({
  version: z.literal(1),
  activeProjectId: z.string().uuid().nullable(),
  projects: z.array(publicProjectSchema),
  // Onboarding state is registry-wide, not per-project. A fresh install has
  // no project yet, so it can't live inside the project. Once onboarding
  // completes it stays at complete:true and we stop redirecting.
  onboarding: onboardingStateSchema.optional(),
});

export type PublicProject = z.infer<typeof publicProjectSchema>;
export type PublicRegistry = z.infer<typeof publicRegistrySchema>;

// ── Secrets (/config/secrets.json, mode 0600) ───────────────────────────
//
// Keyed by project id so we can look up a secret given only a project id
// from the public registry. Split from the public registry so that a bug
// or a backup script that serializes projects.json never accidentally
// touches these values.

export const projectSecretsSchema = z.object({
  serviceRoleKey: z.string().min(20),
});

export const secretsFileSchema = z.object({
  version: z.literal(1),
  projects: z.record(z.string().uuid(), projectSecretsSchema),
});

export type ProjectSecrets = z.infer<typeof projectSecretsSchema>;
export type SecretsFile = z.infer<typeof secretsFileSchema>;

// ── Combined (server-only) type ─────────────────────────────────────────
//
// Use this only in code paths that need to talk to Supabase with the
// service role key (gateway provisioning, command enqueue with elevated
// privileges, etc.). Never serialize a ProjectWithSecrets to anything
// that reaches the browser — TypeScript catches accidental leaks at
// compile time because /api/config and window.__HQ_CONFIG__ are typed
// to PublicProject.

export type ProjectWithSecrets = PublicProject & ProjectSecrets;
