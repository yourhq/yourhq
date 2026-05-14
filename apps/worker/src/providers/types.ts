export interface SpawnResult {
  sandboxId: string;
  novncUrl: string;
  accessToken: string;
  sandboxHost: string;
}

export type SandboxStatus = "running" | "paused" | "stopped" | "unknown";

export interface SandboxProvider {
  spawn(opts: {
    workspaceId: string;
    envs: Record<string, string>;
  }): Promise<SpawnResult>;

  destroy(sandboxId: string): Promise<void>;

  pause(sandboxId: string): Promise<void>;

  resume(sandboxId: string): Promise<void>;

  renewTimeout(sandboxId: string, timeoutMs: number): Promise<void>;

  status(sandboxId: string): Promise<SandboxStatus>;
}
