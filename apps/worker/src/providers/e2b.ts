import { Sandbox } from "e2b";
import type { SandboxProvider, SpawnResult } from "./types.js";

const DEFAULT_TEMPLATE_NAME = "yourhq-gateway";
const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h
const E2B_API_BASE = "https://api.e2b.dev";

function getApiKey(): string {
  const key = process.env.E2B_API_KEY;
  if (!key) throw new Error("E2B_API_KEY is required");
  return key;
}

export class E2BSandboxProvider implements SandboxProvider {
  async spawn(opts: {
    workspaceId: string;
    envs: Record<string, string>;
  }): Promise<SpawnResult> {
    const templateName = process.env.E2B_TEMPLATE_NAME ?? DEFAULT_TEMPLATE_NAME;
    const sandbox = await Sandbox.create(templateName, {
      envs: {
        ...opts.envs,
        RUNTIME_MODE: "e2b",
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
      metadata: { workspaceId: opts.workspaceId },
    });

    const sandboxId = sandbox.sandboxId;
    const novncHost = sandbox.getHost(6901);
    const novncUrl = `https://${novncHost}/vnc.html?autoconnect=1&resize=remote`;
    const baseHost = novncHost.replace(/^6901-/, "");
    const sandboxHost = `https://${baseHost}`;

    await sandbox.files.write("/tmp/sandbox-host", sandboxHost);

    return {
      sandboxId,
      novncUrl,
      accessToken: "",
      sandboxHost,
    };
  }

  async destroy(sandboxId: string): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.kill();
  }

  async pause(sandboxId: string): Promise<void> {
    const res = await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}/pause`, {
      method: "POST",
      headers: {
        "X-API-Key": getApiKey(),
        "Content-Type": "application/json",
      },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`E2B pause failed (${res.status})`);
    }
  }

  async resume(sandboxId: string): Promise<void> {
    const res = await fetch(`${E2B_API_BASE}/sandboxes/${sandboxId}/resume`, {
      method: "POST",
      headers: {
        "X-API-Key": getApiKey(),
        "Content-Type": "application/json",
      },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`E2B resume failed (${res.status})`);
    }
  }

  async renewTimeout(sandboxId: string, timeoutMs: number): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(timeoutMs);
  }
}
