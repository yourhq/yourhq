export interface SpawnResult {
  sandboxId: string;
  novncUrl: string;
  accessToken: string;
}

export interface SandboxProvider {
  spawn(opts: {
    workspaceId: string;
    envs: Record<string, string>;
  }): Promise<SpawnResult>;

  destroy(sandboxId: string): Promise<void>;

  renewTimeout(sandboxId: string, timeoutMs: number): Promise<void>;
}
