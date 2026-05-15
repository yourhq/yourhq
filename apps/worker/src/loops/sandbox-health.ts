import {
  getMasterSupabase,
  getWorkspace,
  updateWorkspace,
  logSandboxEvent,
} from "../lib/master-supabase.js";
import { reportLoopRun } from "../lib/loop-status.js";
import { decryptSecret } from "../lib/secret-crypto.js";
import { sendSandboxError } from "../lib/email.js";
import { getPublicSiteUrl } from "../lib/env.js";
import type { SandboxProvider } from "../providers/types.js";

const HEALTH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RESPAWNS_PER_DAY = 3;
const GATEWAY_WAIT_TIMEOUT_MS = 60_000;

async function resolveEmail(userId: string): Promise<string | null> {
  const db = getMasterSupabase();
  const { data } = await db
    .from("hosted_users")
    .select("email")
    .eq("id", userId)
    .single();
  return data?.email ?? null;
}

async function countRecentRespawns(workspaceId: string): Promise<number> {
  const db = getMasterSupabase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("sandbox_events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("event", "auto_respawned")
    .gte("created_at", since);
  return count ?? 0;
}

async function waitForGateway(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<boolean> {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const start = Date.now();
  while (Date.now() - start < GATEWAY_WAIT_TIMEOUT_MS) {
    const { data } = await client.from("gateways").select("id").limit(1);
    if (data && data.length > 0) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

export function startSandboxHealthLoop(provider: SandboxProvider): NodeJS.Timeout {
  async function check() {
    const db = getMasterSupabase();
    const { data: workspaces } = await db
      .from("hosted_workspaces")
      .select("id, user_id, e2b_sandbox_id, e2b_sandbox_status, supabase_url, supabase_service_role_key_enc, vnc_password_enc, label")
      .eq("e2b_sandbox_status", "running")
      .in("subscription_status", ["active", "provisioning"]);

    if (!workspaces?.length) return;

    for (const ws of workspaces) {
      if (!ws.e2b_sandbox_id) continue;

      let actual;
      try {
        actual = await provider.status(ws.e2b_sandbox_id);
      } catch {
        console.warn(`[sandbox-health] Could not check status for ${ws.id}`);
        continue;
      }

      if (actual === "unknown") continue;

      if (actual === "paused") {
        await updateWorkspace(ws.id, { e2b_sandbox_status: "paused" } as any);
        await logSandboxEvent(ws.id, "status_synced", { from: "running", to: "paused" });
        continue;
      }

      if (actual === "running") continue;

      // Sandbox is stopped — attempt respawn
      const recentRespawns = await countRecentRespawns(ws.id);

      if (recentRespawns >= MAX_RESPAWNS_PER_DAY) {
        await updateWorkspace(ws.id, { e2b_sandbox_status: "error" } as any);
        await logSandboxEvent(ws.id, "respawn_limit_reached", {
          respawn_count: recentRespawns,
        });

        const email = await resolveEmail(ws.user_id);
        if (email) {
          const origin = getPublicSiteUrl();
          sendSandboxError(email, ws.label, `${origin}/dashboard/account`).catch(
            () => console.error(`[sandbox-health] Failed to send error email for ${ws.id}`),
          );
        }
        continue;
      }

      // Respawn
      console.log(`[sandbox-health] Respawning sandbox for workspace ${ws.id} (attempt ${recentRespawns + 1}/${MAX_RESPAWNS_PER_DAY})`);

      const serviceRoleKey = decryptSecret(ws.supabase_service_role_key_enc);
      const vncPassword = decryptSecret(ws.vnc_password_enc);

      if (!ws.supabase_url || !serviceRoleKey || !vncPassword) {
        console.error(`[sandbox-health] Missing credentials for respawn, workspace ${ws.id}`);
        await updateWorkspace(ws.id, { e2b_sandbox_status: "error" } as any);
        await logSandboxEvent(ws.id, "respawn_failed", { reason: "missing_credentials" });
        continue;
      }

      try {
        await provider.destroy(ws.e2b_sandbox_id).catch(() => {});

        const result = await provider.spawn({
          workspaceId: ws.id,
          envs: {
            SUPABASE_URL: ws.supabase_url,
            SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
            VNC_PASSWORD: vncPassword,
            GATEWAY_ID: "default",
            GATEWAY_LABEL: ws.label,
            TENANT_ID: "00000000-0000-0000-0000-000000000000",
            NETWORKING_MODE: "e2b",
          },
        });

        await updateWorkspace(ws.id, {
          e2b_sandbox_id: result.sandboxId,
          e2b_sandbox_status: "running",
          novnc_url: result.novncUrl,
          e2b_access_token: result.accessToken,
        } as any);

        await logSandboxEvent(ws.id, "auto_respawned", {
          old_sandbox_id: ws.e2b_sandbox_id,
          new_sandbox_id: result.sandboxId,
          attempt: recentRespawns + 1,
        });

        const gwReady = await waitForGateway(ws.supabase_url, serviceRoleKey);
        if (!gwReady) {
          console.warn(`[sandbox-health] Gateway did not register after respawn for ${ws.id}`);
          await logSandboxEvent(ws.id, "respawn_gateway_timeout", {
            sandbox_id: result.sandboxId,
          });
        }
      } catch (err) {
        console.error(`[sandbox-health] Respawn failed for ${ws.id}:`, err);
        await updateWorkspace(ws.id, { e2b_sandbox_status: "error" } as any);
        await logSandboxEvent(ws.id, "respawn_failed", {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const run = () =>
    check()
      .then(() => reportLoopRun("sandbox-health", true))
      .catch((err) => {
        reportLoopRun("sandbox-health", false, err instanceof Error ? err.message : String(err));
        console.error("[sandbox-health]", err);
      });
  run();
  return setInterval(run, HEALTH_INTERVAL_MS);
}
