// Zod schemas for the project registry. Validated on every read so a
// hand-edited or corrupted file fails loudly instead of crashing with
// a cryptic undefined-is-not-a-function 10 call frames deep.

import { z } from "zod";

// ── Public registry (/config/projects.json) ─────────────────────────────
//
// Everything in here is safe to serve to the browser: URL, anon key,
// labels. Never includes the service role key — that lives in secrets.json.

export const publicProjectSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8),
  url: z.string().url(),
  anonKey: z.string().min(20),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
});

export const publicRegistrySchema = z.object({
  version: z.literal(1),
  activeProjectId: z.string().uuid().nullable(),
  projects: z.array(publicProjectSchema),
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
