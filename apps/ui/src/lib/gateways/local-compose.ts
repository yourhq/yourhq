// Starts / inspects the local Docker Compose gateway profile from the UI
// container. Used by the onboarding flow when the user picks "run agents
// on this machine" — we bring up the gateway services without asking the
// user to open a terminal.
//
// Relies on /var/run/docker.sock being mounted into the UI container
// (see docker-compose.yml). On Linux, this works out of the box. On
// macOS Docker Desktop the socket is the VM's socket and is accessible
// via the docker.sock path the same way.
//
// For compose commands we invoke the Docker CLI directly. The image
// ships `docker` binary via `apt install docker.io` — we add that to
// the UI Dockerfile. If the binary isn't present, this helper returns
// a clear error and the UI falls back to "copy this command yourself."

import "server-only";
import { spawn } from "child_process";

export interface ComposeResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
}

function run(
  cmd: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<ComposeResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        stdout: Buffer.concat(out).toString("utf-8"),
        stderr: Buffer.concat(err).toString("utf-8"),
        code,
      });
    });
    child.on("error", (e) => {
      resolve({
        ok: false,
        stdout: "",
        stderr: e.message,
        code: null,
      });
    });
  });
}

export async function dockerAvailable(): Promise<boolean> {
  const r = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  return r.ok;
}

/**
 * Bring up the local `gateway` profile. Returns once Docker reports the
 * services as running — doesn't wait for the gateway to register in
 * Supabase, the caller polls for that separately.
 *
 * If the gateway images haven't been pulled yet this will pull them,
 * which can take a minute or two on a slow connection. The UI shows
 * a progress indicator by calling `composeEvents()` separately.
 */
function composeArgs(...extra: string[]): string[] {
  const fs = require("fs");
  if (fs.existsSync("/compose/docker-compose.yml")) {
    return ["compose", "-f", "/compose/docker-compose.yml", "--env-file", "/compose/.env", ...extra];
  }
  return ["compose", ...extra];
}

export async function startLocalGateway(): Promise<ComposeResult> {
  return run(
    "docker",
    composeArgs("--profile", "gateway", "up", "-d", "--pull", "missing", "--no-build"),
  );
}

export async function stopLocalGateway(): Promise<ComposeResult> {
  return run(
    "docker",
    composeArgs("--profile", "gateway", "stop"),
  );
}

export async function localGatewayStatus(): Promise<{
  running: boolean;
  services: { name: string; state: string }[];
}> {
  const r = await run("docker", composeArgs(
    "--profile",
    "gateway",
    "ps",
    "--format",
    "json",
  ));
  if (!r.ok) return { running: false, services: [] };

  // `docker compose ps --format json` outputs one JSON object per line.
  const lines = r.stdout.split("\n").filter((l) => l.trim());
  const services: { name: string; state: string }[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      services.push({
        name: parsed.Service ?? parsed.Name ?? "unknown",
        state: parsed.State ?? "unknown",
      });
    } catch {
      // ignore malformed lines
    }
  }
  return {
    running: services.length > 0 && services.every((s) => s.state === "running"),
    services,
  };
}
