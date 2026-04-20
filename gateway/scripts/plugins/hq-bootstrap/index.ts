import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const MAX_RETRIES = 3;
const STALE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function statePath(workspaceDir: string, sessionId: string) {
  return path.join(workspaceDir, "state", "session-bootstrap", `${sessionId}.json`);
}

function stateDir(workspaceDir: string) {
  return path.join(workspaceDir, "state", "session-bootstrap");
}

async function ensurePendingState(workspaceDir: string, sessionId: string, sessionKey?: string) {
  const file = statePath(workspaceDir, sessionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          status: "pending",
          sessionId,
          sessionKey: sessionKey || "",
          createdAt: new Date().toISOString(),
          retries: 0,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }
}

async function loadState(workspaceDir: string, sessionId: string) {
  const file = statePath(workspaceDir, sessionId);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

function renderBootContext(state: any) {
  const docs = Array.isArray(state.documents) ? state.documents : [];
  const parts = [
    "HQ bootstrap status: connected.",
    `Agent slug: ${state.agentSlug || "unknown"}.`,
    `Boot documents loaded: ${docs.length}.`,
    "",
    "## HQ Boot Context",
  ];
  for (const doc of docs) {
    parts.push(`\n### ${doc.title || "Untitled"}`);
    if (Array.isArray(doc.tags) && doc.tags.length) parts.push(`Tags: ${doc.tags.join(", ")}`);
    if (doc.content) parts.push(String(doc.content));
  }
  return parts.join("\n");
}

async function cleanupStaleState(workspaceDir: string) {
  const dir = stateDir(workspaceDir);
  try {
    const entries = await fs.readdir(dir);
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const filePath = path.join(dir, entry);
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > STALE_AGE_MS) {
        await fs.unlink(filePath);
      }
    }
  } catch {
    // cleanup is best-effort
  }
}

export default definePluginEntry({
  id: "hq-bootstrap",
  name: "HQ Bootstrap",
  description: "Bootstraps HQ registration and boot-doc context for new sessions",
  register(api) {
    api.on("before_prompt_build", async (_event: any, ctx: any) => {
      const workspaceDir = ctx.workspaceDir || process.cwd();
      const sessionId = ctx.sessionId;
      const sessionKey = ctx.sessionKey || "";

      if (!sessionId) {
        console.warn("[cc-bootstrap] No sessionId in context — skipping bootstrap");
        return;
      }

      await ensurePendingState(workspaceDir, sessionId, sessionKey);
      let state = await loadState(workspaceDir, sessionId);

      // Don't retry if we've already exceeded the cap
      if (state.status === "error" && (state.retries || 0) >= MAX_RETRIES) {
        return {
          appendSystemContext: `HQ bootstrap failed after ${MAX_RETRIES} attempts: ${state.error || "unknown error"}. Bootstrap will not retry this session.`,
        };
      }

      if (state.status !== "done") {
        const scriptPath = path.join(workspaceDir, "scripts", "hq_session_bootstrap.py");
        try {
          await execFileAsync("python3", [scriptPath, "--session-id", sessionId, "--session-key", sessionKey], {
            cwd: workspaceDir,
            env: process.env,
          });
        } catch (err: any) {
          console.warn(`[cc-bootstrap] Bootstrap script failed: ${err.message || err}`);
        }
        state = await loadState(workspaceDir, sessionId);
      }

      // Fire-and-forget stale state cleanup
      cleanupStaleState(workspaceDir);

      if (state.status === "done") {
        return {
          appendSystemContext: renderBootContext(state),
        };
      }

      if (state.status === "error") {
        const retries = state.retries || 0;
        const suffix = retries >= MAX_RETRIES ? " Bootstrap will not retry this session." : "";
        return {
          appendSystemContext: `HQ bootstrap failed (attempt ${retries}/${MAX_RETRIES}): ${state.error || "unknown error"}.${suffix}`,
        };
      }
    });
  },
});
