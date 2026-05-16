import { createClient } from "@supabase/supabase-js";
import {
  getWorkspace,
  updateWorkspace,
  logSandboxEvent,
} from "./master-supabase.js";
import { resolvePreset } from "./setup-templates.js";
import { applyMigrations } from "./schema-runner.js";
import { sendProvisioningComplete } from "./email.js";
import { SUPABASE_MGMT_URL, mgmtHeaders } from "./supabase-mgmt.js";
import { decryptSecret, encryptSecret } from "./secret-crypto.js";
import { getPublicSiteUrl } from "./env.js";
import type { SandboxProvider } from "../providers/types.js";
import { randomBytes } from "node:crypto";

const provisionLocks = new Map<string, Promise<void>>();

async function setStage(workspaceId: string, stage: string) {
  await updateWorkspace(workspaceId, { provision_stage: stage } as any);
}

async function setError(workspaceId: string, error: string) {
  await updateWorkspace(workspaceId, {
    provision_stage: "error",
    provision_error: error.slice(0, 500),
    subscription_status: "provisioning",
  } as any);
}

export async function provisionWorkspace(
  workspaceId: string,
  email: string,
  sandboxProvider: SandboxProvider,
): Promise<void> {
  const existing = provisionLocks.get(workspaceId);
  if (existing) {
    await existing;
    return;
  }

  let resolve: () => void;
  const lock = new Promise<void>((r) => { resolve = r; });
  provisionLocks.set(workspaceId, lock);

  try {
    await doProvision(workspaceId, email, sandboxProvider);
  } finally {
    provisionLocks.delete(workspaceId);
    resolve!();
  }
}

async function doProvision(
  workspaceId: string,
  email: string,
  sandboxProvider: SandboxProvider,
): Promise<void> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  try {
    await updateWorkspace(workspaceId, {
      provision_attempts: (workspace.provision_attempts ?? 0) + 1,
      last_provision_attempt_at: new Date().toISOString(),
      provision_error: null,
      subscription_status: "provisioning",
    } as any);

    // ── 1. Create Supabase project ──
    await setStage(workspaceId, "creating_project");

    const orgId = process.env.SUPABASE_ORG_ID;
    if (!orgId) throw new Error("SUPABASE_ORG_ID required");

    // Re-read to catch project created by a concurrent caller
    const freshForProject = await getWorkspace(workspaceId);
    let projectRef = freshForProject?.supabase_project_ref ?? workspace.supabase_project_ref;
    let dbPassword = decryptSecret(freshForProject?.supabase_db_password_enc ?? workspace.supabase_db_password_enc);
    if (!projectRef) {
      dbPassword = randomBytes(24).toString("base64url");

      const createRes = await fetch(`${SUPABASE_MGMT_URL}/v1/projects`, {
        method: "POST",
        headers: mgmtHeaders(),
        body: JSON.stringify({
          organization_id: orgId,
          name: `hq-${workspace.label.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30)}-${workspaceId.slice(0, 8)}`,
          db_pass: dbPassword,
          region: process.env.SUPABASE_REGION ?? "us-east-1",
          plan: process.env.SUPABASE_PROJECT_PLAN ?? "pro",
        }),
      });

      if (!createRes.ok) {
        throw new Error(`Supabase project creation failed (${createRes.status})`);
      }

      const project = (await createRes.json()) as { id: string; name: string };
      projectRef = project.id;
      await updateWorkspace(workspaceId, {
        supabase_project_ref: projectRef,
        supabase_url: `https://${projectRef}.supabase.co`,
        supabase_db_password_enc: encryptSecret(dbPassword),
      } as any);
    }

    // ── 2. Poll until project is ready ──
    await setStage(workspaceId, "waiting_for_project");
    const startPoll = Date.now();
    let projectReady = false;
    while (Date.now() - startPoll < 120_000) {
      const statusRes = await fetch(`${SUPABASE_MGMT_URL}/v1/projects/${projectRef}`, {
        headers: mgmtHeaders(),
      });
      if (statusRes.ok) {
        const status = (await statusRes.json()) as { status: string };
        if (status.status === "ACTIVE_HEALTHY") {
          projectReady = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!projectReady) throw new Error("Supabase project did not become ready in time");

    // ── 3. Fetch API keys ──
    await setStage(workspaceId, "fetching_keys");
    let anonKey = workspace.supabase_anon_key;
    let serviceRoleKey = decryptSecret(workspace.supabase_service_role_key_enc);
    if (!anonKey || !serviceRoleKey) {
      const keysRes = await fetch(`${SUPABASE_MGMT_URL}/v1/projects/${projectRef}/api-keys`, {
        headers: mgmtHeaders(),
      });
      if (!keysRes.ok) throw new Error("Failed to fetch project API keys");

      const keys = (await keysRes.json()) as { name: string; api_key: string }[];
      anonKey = keys.find((k) => k.name === "publishable" || k.name === "anon")?.api_key ?? null;
      serviceRoleKey = keys.find((k) => k.name === "secret" || k.name === "service_role")?.api_key ?? null;
      if (!anonKey || !serviceRoleKey) throw new Error("Missing API keys from project");
    }

    const supabaseUrl = `https://${projectRef}.supabase.co`;

    await updateWorkspace(workspaceId, {
      supabase_project_ref: projectRef,
      supabase_url: supabaseUrl,
      supabase_anon_key: anonKey,
      supabase_service_role_key_enc: encryptSecret(serviceRoleKey),
      supabase_db_password_enc: dbPassword
        ? encryptSecret(dbPassword)
        : workspace.supabase_db_password_enc,
    } as any);

    // ── 3b. Configure auth settings (site URL + redirect allowlist) ──
    const publicSiteUrl = getPublicSiteUrl();
    const authConfigRes = await fetch(`${SUPABASE_MGMT_URL}/v1/projects/${projectRef}/config/auth`, {
      method: "PATCH",
      headers: mgmtHeaders(),
      body: JSON.stringify({
        SITE_URL: publicSiteUrl,
        URI_ALLOW_LIST: `${publicSiteUrl}/auth/callback`,
      }),
    });
    if (!authConfigRes.ok) throw new Error("Failed to configure tenant auth settings");

    // ── 4. Apply schema migrations ──
    await setStage(workspaceId, "applying_schema");
    await applyMigrations(projectRef);

    // ── 5. Create auth user in tenant Supabase ──
    await setStage(workspaceId, "creating_user");
    const tenantClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await tenantClient.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: {
        tenant_id: "00000000-0000-0000-0000-000000000000",
      },
    });
    if (authError && !authError.message.toLowerCase().includes("already")) {
      throw new Error(`Auth user creation failed: ${authError.message}`);
    }

    // ── 5a. Generate auto-login URL (skips email round-trip for first login) ──
    let autoLoginUrl: string | null = null;
    try {
      const { data: linkData } = await tenantClient.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${publicSiteUrl}/auth/callback?next=/onboarding` },
      });
      if (linkData?.properties?.action_link) {
        autoLoginUrl = linkData.properties.action_link;
        await updateWorkspace(workspaceId, { auto_login_url: autoLoginUrl } as any);
      }
    } catch {
      // Non-fatal — user can still log in via magic link email
    }

    // ── 5b. Initialize workspace via complete_setup() ──
    const { count: wsCount } = await tenantClient
      .from("workspace")
      .select("id", { count: "exact", head: true });

    if (!wsCount) {
      const meta = workspace.setup_metadata ?? {};
      const ownerName = meta.ownerName || "";
      const presetKey = meta.contextPreset || "other";
      const { stages, fields, streams, modules } = resolvePreset(presetKey);

      const slug = workspace.label
        .toLowerCase()
        .replace(/['']s\b/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "workspace";

      const { error: setupError } = await tenantClient.rpc("complete_setup", {
        p_name: workspace.label,
        p_slug: slug,
        p_description: "",
        p_owner_name: ownerName,
        p_preferred_name: ownerName.split(" ")[0] || "",
        p_timezone: "UTC",
        p_stages: stages,
        p_fields: fields,
        p_streams: streams,
      });
      if (setupError) throw new Error(`Workspace setup failed: ${setupError.message}`);

      if (modules) {
        await tenantClient
          .from("workspace")
          .update({ settings: { modules } })
          .eq("tenant_id", "00000000-0000-0000-0000-000000000000");
      }
    }

    // ── 6. Spawn E2B sandbox ──
    await setStage(workspaceId, "starting_sandbox");

    let spawnResult: { sandboxId: string; novncUrl: string; accessToken: string; sandboxHost: string } | null = null;
    let vncPassword: string | null = null;

    const freshWs = await getWorkspace(workspaceId);
    if (!freshWs?.e2b_sandbox_id) {
      vncPassword = randomBytes(12).toString("base64url").slice(0, 12);

      const sandbox = await sandboxProvider.spawn({
        workspaceId,
        envs: {
          SUPABASE_URL: supabaseUrl,
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
          VNC_PASSWORD: vncPassword,
          GATEWAY_ID: "default",
          GATEWAY_LABEL: workspace.label,
          TENANT_ID: "00000000-0000-0000-0000-000000000000",
          NETWORKING_MODE: "hosted",
        },
      });

      spawnResult = sandbox;

      await updateWorkspace(workspaceId, {
        e2b_sandbox_id: sandbox.sandboxId,
        e2b_sandbox_status: "running",
        e2b_access_token: sandbox.accessToken,
        novnc_url: sandbox.novncUrl,
        vnc_password_enc: encryptSecret(vncPassword),
      } as any);
    }

    // ── 7. Wait for gateway to register ──
    await setStage(workspaceId, "waiting_for_gateway");
    const gwStart = Date.now();
    let gatewayReady = false;
    while (Date.now() - gwStart < 120_000) {
      const { data } = await tenantClient
        .from("gateways")
        .select("id")
        .limit(1);
      if (data && data.length > 0) {
        gatewayReady = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!gatewayReady) throw new Error("Gateway did not register in time");

    // ── 7b. Patch gateway meta with correct URLs ──
    // The entrypoint may have lost the race with /tmp/sandbox-host,
    // so we overwrite reachable_urls from the known-good spawn result.
    if (spawnResult) {
      const filesApiHost = spawnResult.sandboxHost.replace(/^https:\/\//, "https://18790-");
      await tenantClient
        .from("gateways")
        .update({
          meta: {
            reachable_urls: {
              base: spawnResult.sandboxHost,
              files_api: filesApiHost,
              novnc: spawnResult.novncUrl,
            },
            networking_mode: "hosted",
            vnc_password: vncPassword,
            files_api_token: spawnResult.accessToken,
          },
        })
        .eq("slug", "default");
    }

    // ── 8. Done ──
    await updateWorkspace(workspaceId, {
      subscription_status: "active",
      provision_stage: "complete",
      e2b_sandbox_status: "running",
    } as any);

    await logSandboxEvent(workspaceId, "provisioned", {
      provision_stage: "complete",
    });

    sendProvisioningComplete(email, workspace.label, `${publicSiteUrl}/login`).catch(
      () => console.error("[provisioner] Failed to send provisioning email"),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[provisioner] Workspace provisioning failed");
    await setError(workspaceId, message);
    await logSandboxEvent(workspaceId, "error", { provision_stage: "error" });
    throw err;
  }
}
