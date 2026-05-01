import { Sandbox } from "e2b";
import type { SandboxProvider, SpawnResult } from "./types.js";

const TEMPLATE_NAME = "yourhq-gateway";
const DEFAULT_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h

export class E2BSandboxProvider implements SandboxProvider {
  async spawn(opts: {
    workspaceId: string;
    envs: Record<string, string>;
  }): Promise<SpawnResult> {
    const sandbox = await Sandbox.create(TEMPLATE_NAME, {
      envs: {
        ...opts.envs,
        RUNTIME_MODE: "e2b",
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
      metadata: { workspaceId: opts.workspaceId },
    });

    const sandboxId = sandbox.sandboxId;
    const host = sandbox.getHost(6901);
    const novncUrl = `https://${host}/vnc.html?autoconnect=1&resize=remote`;

    return {
      sandboxId,
      novncUrl,
      accessToken: "", // E2B v2 uses port auth by default; token extracted from SDK
    };
  }

  async destroy(sandboxId: string): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.kill();
  }

  async renewTimeout(sandboxId: string, timeoutMs: number): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(timeoutMs);
  }
}
