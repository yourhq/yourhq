// Auto-managed gateway auth token.
//
// The files-API on the gateway requires a shared secret (HMAC-checked
// via Authorization: Bearer …). Historically this was a manual env
// var (GATEWAY_AUTH_TOKEN) that the user had to set in .env before
// `docker compose up`. That broke the "everything from the browser"
// promise — Codespaces users hitting `docker compose up -d` directly
// got "GATEWAY_AUTH_TOKEN is not configured" the first time they
// opened an agent's Files tab.
//
// Fix: persist the token at /config/gateway-auth-token (same volume
// the UI uses for projects.json + secrets.json — already mounted
// read-write in the UI container, read-only in gateway containers).
// Generate on first read if missing. Both UI and gateway converge on
// the same value without the user knowing it exists.
//
// Env override (GATEWAY_AUTH_TOKEN) still wins so existing installs
// that wrote it to .env keep working.

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

const TOKEN_PATH = path.join(
  process.env.HQ_CONFIG_DIR ?? "/config",
  "gateway-auth-token",
);

let cached: string | null = null;

export async function getOrCreateGatewayAuthToken(): Promise<string> {
  // Env wins (legacy installs). Cache the resolved value so we don't
  // hit the filesystem on every files-API call.
  if (cached) return cached;
  const fromEnv = process.env.GATEWAY_AUTH_TOKEN?.trim();
  if (fromEnv) {
    cached = fromEnv;
    return cached;
  }

  // Read existing on-disk token.
  try {
    const existing = (await fs.readFile(TOKEN_PATH, "utf-8")).trim();
    if (existing) {
      cached = existing;
      return cached;
    }
  } catch {
    // Not present — fall through to generate.
  }

  // First boot: generate a 32-byte hex token, write atomically.
  const token = randomBytes(32).toString("hex");
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  const tmp = `${TOKEN_PATH}.tmp.${process.pid}`;
  await fs.writeFile(tmp, token, { mode: 0o600 });
  await fs.rename(tmp, TOKEN_PATH);
  cached = token;
  return cached;
}
