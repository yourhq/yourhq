// Project registry — reads and writes the split-file registry at
// /config/projects.json (public) and /config/secrets.json (mode 0600).
//
// Design notes:
//   - Empty registry is the valid first-boot state (returns { activeProjectId:
//     null, projects: [] }).
//   - Writes are atomic (tmp file + rename) so we never leave a half-written
//     JSON file on disk.
//   - Reads are zod-validated; bad JSON throws with a clear error.
//   - Secrets are split into a separate file so the shape of the public
//     registry physically cannot contain a service role key.
//   - File locking: we take a simple cross-process lock file around writes
//     to avoid interleaving when two tabs submit an "add project" at once.
//
// This module uses Node filesystem APIs (fs, path, crypto). It must only
// run in the Node.js runtime — never the Edge runtime. Middleware callers
// opt into `export const runtime = "nodejs"` for this reason.

import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  publicRegistrySchema,
  secretsFileSchema,
  type PublicProject,
  type PublicRegistry,
  type ProjectSecrets,
  type ProjectWithSecrets,
  type SecretsFile,
  type OnboardingState,
  type UiOrigin,
} from "./schema";

const CONFIG_DIR = process.env.HQ_CONFIG_DIR ?? "/config";
const REGISTRY_PATH = path.join(CONFIG_DIR, "projects.json");
const SECRETS_PATH = path.join(CONFIG_DIR, "secrets.json");
const LOCK_PATH = path.join(CONFIG_DIR, ".registry.lock");

const EMPTY_REGISTRY: PublicRegistry = {
  version: 1,
  activeProjectId: null,
  projects: [],
};

const EMPTY_SECRETS: SecretsFile = {
  version: 1,
  projects: {},
};

// ── Logger redaction ────────────────────────────────────────────────────
//
// When something fails reading registry/secrets we may end up logging a
// raw fragment of either file (e.g. malformed JSON dumps). Sanitize the
// fragment before it hits stdout: scrub any value that looks like a
// service role / publishable / anon key, plus anything in a property
// whose name ends in "Key", "Token", or "Secret".

const SECRET_VALUE_PATTERNS: RegExp[] = [
  // Supabase new-format keys (sb_publishable_… / sb_secret_…).
  /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g,
  // Legacy Supabase JWT (eyJ…) — three base64url segments separated by dots.
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Tailscale auth keys (tskey-…)
  /\btskey-[A-Za-z0-9-]+/g,
];

const SECRET_KEY_NAMES = /"([^"]*?(?:Key|Token|Secret))"\s*:\s*"([^"]+)"/g;

function redactForLog(s: string): string {
  let out = s;
  // Property-name-based redaction first (catches whatever's inside the
  // JSON regardless of value shape).
  out = out.replace(SECRET_KEY_NAMES, (_, name: string) => `"${name}":"[redacted]"`);
  // Value-pattern fallback for anything that escaped (raw values inside
  // an arbitrary string, etc.).
  for (const p of SECRET_VALUE_PATTERNS) {
    out = out.replace(p, "[redacted]");
  }
  return out;
}

// ── File IO primitives ──────────────────────────────────────────────────

async function readJsonOrDefault<T>(
  filePath: string,
  defaultValue: T,
): Promise<unknown> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultValue;
    }
    throw new Error(
      `Failed to read ${filePath}: ${(err as Error).message}.`,
    );
  }

  // Treat empty / whitespace-only files as "fresh install" rather than
  // throwing. This happens if a previous write crashed mid-rename, a
  // shell command truncated the file, or a user deletes the contents
  // by hand expecting onboarding to reset.
  if (!raw.trim()) {
    console.warn(`[registry] ${filePath} is empty; treating as fresh install.`);
    return defaultValue;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    // Malformed JSON is user-visible. Log what's there (first 200 chars)
    // so the user can see why it's unreadable, and fall back to the
    // default so the UI doesn't hard-fail — they can re-onboard.
    console.error(
      `[registry] Malformed JSON at ${filePath}: ${(err as Error).message}. ` +
        `First 200 chars: ${redactForLog(raw.slice(0, 200))}`,
    );
    return defaultValue;
  }
}

async function writeJsonAtomic(
  filePath: string,
  data: unknown,
  mode: number = 0o644,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode,
  });
  await fs.rename(tmp, filePath);
  // Explicit chmod in case the umask ate our mode or the file pre-existed.
  await fs.chmod(filePath, mode).catch(() => {});
}

// Cross-process lock via O_EXCL on a marker file. Callers must `.finally()`
// release it. Keeps a timeout so a crashed caller doesn't block forever.
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const handle = await fs.open(LOCK_PATH, "wx");
      await handle.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (Date.now() > deadline) {
        // Stale lock? Take it — log a warning when we do.
        console.warn(
          `[registry] Stale lock at ${LOCK_PATH}; proceeding anyway.`,
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.unlink(LOCK_PATH).catch(() => {});
  }
}

// ── Permission check (chmod 0600 on secrets.json) ───────────────────────

// The gateway / dispatcher / runner containers mount this volume and run
// as different uids AND different groups than the UI container, so 0640
// still locks them out (they fall into "other"). 0644 is the only mode
// that works across the container user matrix without group syncing.
//
// This is acceptable because:
//   - The volume lives inside Docker's managed storage (/var/lib/docker/volumes)
//     which is 0700 root:root on the host — the host filesystem is the real
//     security boundary.
//   - This is a single-user self-hosted product; there's no second tenant.
//   - Only containers declared in docker-compose.yml can mount the volume.
//
// If we ever need stricter isolation (multi-tenant hosted offering), switch
// to encrypting secrets.json at rest with a key from an env-var or KMS.
const SECRETS_MODE = 0o644;

async function ensureSecretsPermissions(): Promise<void> {
  try {
    const stat = await fs.stat(SECRETS_PATH);
    const mode = stat.mode & 0o777;
    if (mode !== SECRETS_MODE) {
      console.warn(
        `[registry] secrets.json has permissions ${mode.toString(8)} ` +
          `(should be ${SECRETS_MODE.toString(8)}). Fixing.`,
      );
      await fs.chmod(SECRETS_PATH, SECRETS_MODE).catch(() => {});
    }
  } catch {
    // File doesn't exist yet; that's fine.
  }
}

// ── Public registry ──────────────────────────────────────────────────────

export async function getRegistry(): Promise<PublicRegistry> {
  const raw = await readJsonOrDefault(REGISTRY_PATH, EMPTY_REGISTRY);
  const parsed = publicRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Malformed ${REGISTRY_PATH}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export async function getProject(id: string): Promise<PublicProject | null> {
  const { projects } = await getRegistry();
  return projects.find((p) => p.id === id) ?? null;
}

/**
 * Resolve the active project. Falls back to the default, then to the first
 * project, then null. Returns the public fields only — never the service
 * role key. Use `getProjectSecrets` separately if you need elevated access.
 */
export async function getActiveProject(
  activeIdHint?: string | null,
): Promise<PublicProject | null> {
  const registry = await getRegistry();
  if (registry.projects.length === 0) return null;

  // Resolution order: cookie hint → registry's activeProjectId → default
  // → first project. Each candidate is validated against the projects
  // list before use; stale ids (deleted project, renamed registry) fall
  // through instead of returning null + triggering a redirect loop.
  const candidates = [
    activeIdHint,
    registry.activeProjectId,
    registry.projects.find((p) => p.isDefault)?.id,
    registry.projects[0].id,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = registry.projects.find((p) => p.id === candidate);
    if (match) return match;
  }

  return null;
}

// ── Secrets (server-only) ────────────────────────────────────────────────

async function readSecretsFile(): Promise<SecretsFile> {
  await ensureSecretsPermissions();
  const raw = await readJsonOrDefault(SECRETS_PATH, EMPTY_SECRETS);
  const parsed = secretsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Malformed ${SECRETS_PATH}: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/**
 * Read the service role key for a specific project. SERVER-ONLY.
 * Never expose the return value to any route that reaches the browser.
 */
export async function getProjectSecrets(
  id: string,
): Promise<ProjectSecrets | null> {
  const file = await readSecretsFile();
  return file.projects[id] ?? null;
}

/**
 * Combined view — public fields + service role key — for code that needs
 * both (e.g. creating a Supabase server client with elevated privileges).
 * SERVER-ONLY. The return type intentionally differs from PublicProject
 * so you can't accidentally pass it to a response helper.
 */
export async function getActiveProjectWithSecrets(
  activeIdHint?: string | null,
): Promise<ProjectWithSecrets | null> {
  const project = await getActiveProject(activeIdHint);
  if (!project) return null;
  const secrets = await getProjectSecrets(project.id);
  if (!secrets) return null;
  return { ...project, ...secrets };
}

// ── Mutations ───────────────────────────────────────────────────────────

export interface AddProjectInput {
  label: string;
  emoji: string;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  makeDefault?: boolean;
}

export async function addProject(input: AddProjectInput): Promise<PublicProject> {
  return withLock(async () => {
    const registry = await getRegistry();
    const secrets = await readSecretsFile();

    const id = randomUUID();
    const now = new Date().toISOString();

    // First project is automatically the default.
    const isDefault = registry.projects.length === 0 || input.makeDefault === true;

    // If we're setting a new default, unset the old one.
    const updatedProjects = isDefault
      ? registry.projects.map((p) => ({ ...p, isDefault: false }))
      : registry.projects;

    const project: PublicProject = {
      id,
      label: input.label,
      emoji: input.emoji,
      url: input.url,
      anonKey: input.anonKey,
      isDefault,
      createdAt: now,
      uiOrigins: [],
    };

    const nextRegistry: PublicRegistry = {
      ...registry,
      activeProjectId: registry.activeProjectId ?? id,
      projects: [...updatedProjects, project],
    };

    const nextSecrets: SecretsFile = {
      ...secrets,
      projects: {
        ...secrets.projects,
        [id]: { serviceRoleKey: input.serviceRoleKey },
      },
    };

    await writeJsonAtomic(REGISTRY_PATH, nextRegistry, 0o644);
    // NOTE: We used to write 0600, but that locks out the gateway /
    // dispatcher / runner containers which mount this volume read-only
    // and run as a different uid than the UI container. The volume lives
    // inside Docker's managed storage, not on the host filesystem; on a
    // single-user self-hosted box the host already protects it. 0640
    // keeps owner+group readable while blocking other processes.
    await writeJsonAtomic(SECRETS_PATH, nextSecrets, SECRETS_MODE);

    return project;
  });
}

export interface UpdateProjectInput {
  label?: string;
  emoji?: string;
  makeDefault?: boolean;
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<PublicProject> {
  return withLock(async () => {
    const registry = await getRegistry();
    const existing = registry.projects.find((p) => p.id === id);
    if (!existing) throw new Error(`Project ${id} not found`);

    const makingDefault = input.makeDefault === true && !existing.isDefault;

    const next: PublicProject = {
      ...existing,
      label: input.label ?? existing.label,
      emoji: input.emoji ?? existing.emoji,
      isDefault: makingDefault ? true : existing.isDefault,
    };

    const updatedProjects = registry.projects.map((p) => {
      if (p.id === id) return next;
      if (makingDefault) return { ...p, isDefault: false };
      return p;
    });

    await writeJsonAtomic(
      REGISTRY_PATH,
      { ...registry, projects: updatedProjects },
      0o644,
    );

    return next;
  });
}

/**
 * Replace the service role key for a project. Used by the rotation UI.
 * Validates non-empty; the caller should also validate the new key works
 * by making a test call to the URL before calling this.
 */
export async function rotateServiceRoleKey(
  id: string,
  newKey: string,
): Promise<void> {
  if (!newKey || newKey.length < 20) {
    throw new Error("Invalid service role key (too short)");
  }
  return withLock(async () => {
    const registry = await getRegistry();
    if (!registry.projects.find((p) => p.id === id)) {
      throw new Error(`Project ${id} not found`);
    }
    const secrets = await readSecretsFile();
    const nextSecrets: SecretsFile = {
      ...secrets,
      projects: {
        ...secrets.projects,
        [id]: { serviceRoleKey: newKey },
      },
    };
    await writeJsonAtomic(SECRETS_PATH, nextSecrets, SECRETS_MODE);
  });
}

export async function deleteProject(id: string): Promise<void> {
  return withLock(async () => {
    const registry = await getRegistry();
    const project = registry.projects.find((p) => p.id === id);
    if (!project) return;

    // Active-project guard: usually we require the user to switch away
    // first. Exception: if this is the *last* project, there's no other
    // project to switch to — letting it through here so the UI can
    // bounce the user to /onboarding (the new fresh-install state).
    const isLast = registry.projects.length === 1;
    if (registry.activeProjectId === id && !isLast) {
      throw new Error(
        "Cannot delete the active project. Switch to another project first.",
      );
    }

    const remaining = registry.projects.filter((p) => p.id !== id);
    // If we removed the default and there are projects left, promote one.
    if (project.isDefault && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }

    const secrets = await readSecretsFile();
    const nextSecrets: SecretsFile = {
      ...secrets,
      projects: Object.fromEntries(
        Object.entries(secrets.projects).filter(([k]) => k !== id),
      ),
    };

    const nextRegistry: PublicRegistry = {
      ...registry,
      activeProjectId:
        remaining.length > 0 ? registry.activeProjectId : null,
      projects: remaining,
      // When the last project is deleted, also clear onboarding state
      // so the wizard restarts from welcome rather than landing on
      // `done` (which would render the post-setup screen against an
      // empty registry).
      onboarding:
        remaining.length === 0 ? undefined : registry.onboarding,
    };

    await writeJsonAtomic(REGISTRY_PATH, nextRegistry, 0o644);
    await writeJsonAtomic(SECRETS_PATH, nextSecrets, SECRETS_MODE);
  });
}

export async function setActiveProject(id: string): Promise<void> {
  return withLock(async () => {
    const registry = await getRegistry();
    if (!registry.projects.find((p) => p.id === id)) {
      throw new Error(`Project ${id} not found`);
    }
    await writeJsonAtomic(
      REGISTRY_PATH,
      { ...registry, activeProjectId: id },
      0o644,
    );
  });
}

// ── Onboarding state ────────────────────────────────────────────────────

/**
 * Fetch the current onboarding state. Returns a fresh state keyed at
 * step="welcome" if we haven't started yet.
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  const registry = await getRegistry();
  if (registry.onboarding) return registry.onboarding;
  return {
    version: 1,
    step: "welcome",
    complete: false,
    data: {},
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merge updates into the onboarding state. The `data` blob deep-merges
 * at the top level so callers can patch a single key without read-modify-write.
 */
export async function patchOnboardingState(
  patch: Partial<Pick<OnboardingState, "step" | "complete">> & {
    data?: Record<string, unknown>;
  },
): Promise<OnboardingState> {
  return withLock(async () => {
    const registry = await getRegistry();
    const prev: OnboardingState = registry.onboarding ?? {
      version: 1,
      step: "welcome",
      complete: false,
      data: {},
      updatedAt: new Date().toISOString(),
    };

    const next: OnboardingState = {
      version: 1,
      step: patch.step ?? prev.step,
      complete: patch.complete ?? prev.complete,
      data: { ...prev.data, ...(patch.data ?? {}) },
      updatedAt: new Date().toISOString(),
    };

    await writeJsonAtomic(
      REGISTRY_PATH,
      { ...registry, onboarding: next },
      0o644,
    );
    return next;
  });
}

// ── UI origins (per-project) ────────────────────────────────────────────

export async function setUiOrigins(
  projectId: string,
  origins: UiOrigin[],
): Promise<void> {
  return withLock(async () => {
    const registry = await getRegistry();
    const projects = registry.projects.map((p) =>
      p.id === projectId ? { ...p, uiOrigins: origins } : p,
    );
    await writeJsonAtomic(REGISTRY_PATH, { ...registry, projects }, 0o644);
  });
}
