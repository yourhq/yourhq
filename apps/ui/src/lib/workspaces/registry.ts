import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  publicRegistrySchema,
  secretsFileSchema,
  type PublicWorkspace,
  type PublicRegistry,
  type WorkspaceSecrets,
  type WorkspaceWithSecrets,
  type SecretsFile,
  type OnboardingState,
  type UiOrigin,
} from "./schema";

const CONFIG_DIR = process.env.HQ_CONFIG_DIR ?? "/config";
const REGISTRY_PATH = path.join(CONFIG_DIR, "workspaces.json");
const SECRETS_PATH = path.join(CONFIG_DIR, "secrets.json");
const LOCK_PATH = path.join(CONFIG_DIR, ".registry.lock");

const EMPTY_REGISTRY: PublicRegistry = {
  version: 1,
  activeWorkspaceId: null,
  workspaces: [],
};

const EMPTY_SECRETS: SecretsFile = {
  version: 1,
  workspaces: {},
};

// ── Logger redaction ────────────────────────────────────────────────────

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /\btskey-[A-Za-z0-9-]+/g,
];

const SECRET_KEY_NAMES = /"([^"]*?(?:Key|Token|Secret))"\s*:\s*"([^"]+)"/g;

function redactForLog(s: string): string {
  let out = s;
  out = out.replace(SECRET_KEY_NAMES, (_, name: string) => `"${name}":"[redacted]"`);
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

  if (!raw.trim()) {
    console.warn(`[registry] ${filePath} is empty; treating as fresh install.`);
    return defaultValue;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
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
  await fs.chmod(filePath, mode).catch(() => {});
}

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

// ── Permission check ───────────────────────────────────────────────────

const SECRETS_MODE = 0o640;

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

export async function getWorkspace(id: string): Promise<PublicWorkspace | null> {
  const { workspaces } = await getRegistry();
  return workspaces.find((w) => w.id === id) ?? null;
}

export async function getActiveWorkspace(
  activeIdHint?: string | null,
): Promise<PublicWorkspace | null> {
  const registry = await getRegistry();
  if (registry.workspaces.length === 0) return null;

  const candidates = [
    activeIdHint,
    registry.activeWorkspaceId,
    registry.workspaces.find((w) => w.isDefault)?.id,
    registry.workspaces[0].id,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = registry.workspaces.find((w) => w.id === candidate);
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

export async function getWorkspaceSecrets(
  id: string,
): Promise<WorkspaceSecrets | null> {
  const secrets = await readSecretsFile();
  return secrets.workspaces[id] ?? null;
}

export async function getActiveWorkspaceWithSecrets(
  activeIdHint?: string | null,
): Promise<WorkspaceWithSecrets | null> {
  const workspace = await getActiveWorkspace(activeIdHint);
  if (!workspace) return null;
  const secrets = await getWorkspaceSecrets(workspace.id);
  if (!secrets) return null;
  return { ...workspace, ...secrets };
}

// ── Mutations ───────────────────────────────────────────────────────────

export interface AddWorkspaceInput {
  label: string;
  emoji: string;
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  makeDefault?: boolean;
}

export async function addWorkspace(input: AddWorkspaceInput): Promise<PublicWorkspace> {
  return withLock(async () => {
    const registry = await getRegistry();
    const secrets = await readSecretsFile();

    const id = randomUUID();
    const now = new Date().toISOString();

    const isDefault = registry.workspaces.length === 0 || input.makeDefault === true;

    const updatedWorkspaces = isDefault
      ? registry.workspaces.map((w) => ({ ...w, isDefault: false }))
      : registry.workspaces;

    const workspace: PublicWorkspace = {
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
      activeWorkspaceId: registry.activeWorkspaceId ?? id,
      workspaces: [...updatedWorkspaces, workspace],
    };

    const nextSecrets: SecretsFile = {
      ...secrets,
      workspaces: {
        ...secrets.workspaces,
        [id]: { serviceRoleKey: input.serviceRoleKey },
      },
    };

    await writeJsonAtomic(REGISTRY_PATH, nextRegistry, 0o644);
    await writeJsonAtomic(SECRETS_PATH, nextSecrets, SECRETS_MODE);

    return workspace;
  });
}

export interface UpdateWorkspaceInput {
  label?: string;
  emoji?: string;
  makeDefault?: boolean;
}

export async function updateWorkspace(
  id: string,
  input: UpdateWorkspaceInput,
): Promise<PublicWorkspace> {
  return withLock(async () => {
    const registry = await getRegistry();
    const existing = registry.workspaces.find((w) => w.id === id);
    if (!existing) throw new Error(`Workspace ${id} not found`);

    const makingDefault = input.makeDefault === true && !existing.isDefault;

    const next: PublicWorkspace = {
      ...existing,
      label: input.label ?? existing.label,
      emoji: input.emoji ?? existing.emoji,
      isDefault: makingDefault ? true : existing.isDefault,
    };

    const updatedWorkspaces = registry.workspaces.map((w) => {
      if (w.id === id) return next;
      if (makingDefault) return { ...w, isDefault: false };
      return w;
    });

    await writeJsonAtomic(
      REGISTRY_PATH,
      { ...registry, workspaces: updatedWorkspaces },
      0o644,
    );

    return next;
  });
}

export async function rotateServiceRoleKey(
  id: string,
  newKey: string,
): Promise<void> {
  if (!newKey || newKey.length < 20) {
    throw new Error("Invalid service role key (too short)");
  }
  return withLock(async () => {
    const registry = await getRegistry();
    if (!registry.workspaces.find((w) => w.id === id)) {
      throw new Error(`Workspace ${id} not found`);
    }
    const secrets = await readSecretsFile();
    const nextSecrets: SecretsFile = {
      ...secrets,
      workspaces: {
        ...secrets.workspaces,
        [id]: { serviceRoleKey: newKey },
      },
    };
    await writeJsonAtomic(SECRETS_PATH, nextSecrets, SECRETS_MODE);
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  return withLock(async () => {
    const registry = await getRegistry();
    const workspace = registry.workspaces.find((w) => w.id === id);
    if (!workspace) return;

    const isLast = registry.workspaces.length === 1;
    if (registry.activeWorkspaceId === id && !isLast) {
      throw new Error(
        "Cannot delete the active workspace. Switch to another workspace first.",
      );
    }

    const remaining = registry.workspaces.filter((w) => w.id !== id);
    if (workspace.isDefault && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }

    const secrets = await readSecretsFile();
    const nextSecrets: SecretsFile = {
      ...secrets,
      workspaces: Object.fromEntries(
        Object.entries(secrets.workspaces).filter(([k]) => k !== id),
      ),
    };

    const nextRegistry: PublicRegistry = {
      ...registry,
      activeWorkspaceId:
        remaining.length > 0 ? registry.activeWorkspaceId : null,
      workspaces: remaining,
      onboarding:
        remaining.length === 0 ? undefined : registry.onboarding,
    };

    await writeJsonAtomic(REGISTRY_PATH, nextRegistry, 0o644);
    await writeJsonAtomic(SECRETS_PATH, nextSecrets, SECRETS_MODE);
  });
}

export async function setActiveWorkspace(id: string): Promise<void> {
  return withLock(async () => {
    const registry = await getRegistry();
    if (!registry.workspaces.find((w) => w.id === id)) {
      throw new Error(`Workspace ${id} not found`);
    }
    await writeJsonAtomic(
      REGISTRY_PATH,
      { ...registry, activeWorkspaceId: id },
      0o644,
    );
  });
}

// ── Onboarding state ────────────────────────────────────────────────────

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

// ── UI origins (per-workspace) ──────────────────────────────────────────

export async function setUiOrigins(
  workspaceId: string,
  origins: UiOrigin[],
): Promise<void> {
  return withLock(async () => {
    const registry = await getRegistry();
    const workspaces = registry.workspaces.map((w) =>
      w.id === workspaceId ? { ...w, uiOrigins: origins } : w,
    );
    await writeJsonAtomic(REGISTRY_PATH, { ...registry, workspaces }, 0o644);
  });
}
