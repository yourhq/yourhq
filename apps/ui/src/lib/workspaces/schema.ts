import { z } from "zod";

// ── Public registry (/config/workspaces.json) ───────────────────────────
//
// Everything in here is safe to serve to the browser: URL, anon key,
// labels. Never includes the service role key — that lives in secrets.json.

export const uiOriginSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(40).optional(),
  kind: z.enum(["localhost", "lan", "tailnet", "public", "custom"]).default("custom"),
});
export type UiOrigin = z.infer<typeof uiOriginSchema>;

export const publicWorkspaceSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8),
  url: z.string().url(),
  anonKey: z.string().min(20),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
  uiOrigins: z.array(uiOriginSchema).optional().default([]),
});

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
    "profile",
    "pipeline",
    "fields",
    "streams",
    "first_agent",
    "done",
  ]).default("welcome"),
  complete: z.boolean().default(false),
  data: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string().datetime(),
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;

export const publicRegistrySchema = z.object({
  version: z.literal(1),
  activeWorkspaceId: z.string().uuid().nullable(),
  workspaces: z.array(publicWorkspaceSchema),
  onboarding: onboardingStateSchema.optional(),
});

export type PublicWorkspace = z.infer<typeof publicWorkspaceSchema>;
export type PublicRegistry = z.infer<typeof publicRegistrySchema>;

// ── Secrets (/config/secrets.json, mode 0600) ───────────────────────────

export const workspaceSecretsSchema = z.object({
  serviceRoleKey: z.string().min(20),
});

export const secretsFileSchema = z.object({
  version: z.literal(1),
  workspaces: z.record(z.string().uuid(), workspaceSecretsSchema),
});

export type WorkspaceSecrets = z.infer<typeof workspaceSecretsSchema>;
export type SecretsFile = z.infer<typeof secretsFileSchema>;

// ── Combined (server-only) type ─────────────────────────────────────────

export type WorkspaceWithSecrets = PublicWorkspace & WorkspaceSecrets;
