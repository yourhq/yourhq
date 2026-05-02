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

  async renewTimeout(sandboxId: string, timeoutMs: number): Promise<void> {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(timeoutMs);
  }
}
