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
import type { SandboxProvider } from "../providers/types.js";
import { randomBytes } from "node:crypto";

async function setStage(workspaceId: string, stage: string) {
  await updateWorkspace(workspaceId, { provision_stage: stage } as any);
}

async function setError(workspaceId: string, error: string) {
  await updateWorkspace(workspaceId, {
    provision_stage: "error",
    provision_error: error,
    subscription_status: "pending",
  } as any);
}

export async function provisionWorkspace(
  workspaceId: string,
  email: string,
  sandboxProvider: SandboxProvider,
): Promise<void> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  try {
    // ── 1. Create Supabase project ──
    await setStage(workspaceId, "creating_project");
    await updateWorkspace(workspaceId, { subscription_status: "provisioning" } as any);

    const orgId = process.env.SUPABASE_ORG_ID;
    if (!orgId) throw new Error("SUPABASE_ORG_ID required");

    const dbPassword = randomBytes(24).toString("base64url");

    const createRes = await fetch(`${SUPABASE_MGMT_URL}/v1/projects`, {
      method: "POST",
      headers: mgmtHeaders(),
      body: JSON.stringify({
        organization_id: orgId,
        name: `hq-${workspace.label.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30)}-${workspaceId.slice(0, 8)}`,
        db_pass: dbPassword,
        region: process.env.SUPABASE_REGION ?? "us-east-1",
        plan: "free",
      }),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Supabase project creation failed: ${createRes.status} ${body}`);
    }

    const project = (await createRes.json()) as { id: string; name: string };
    const projectRef = project.id;

    // ── 2. Poll until project is ready ──
    await setStage(workspaceId, "waiting_for_project");
    const startPoll = Date.now();
    while (Date.now() - startPoll < 120_000) {
      const statusRes = await fetch(`${SUPABASE_MGMT_URL}/v1/projects/${projectRef}`, {
        headers: mgmtHeaders(),
      });
      if (statusRes.ok) {
        const status = (await statusRes.json()) as { status: string };
        if (status.status === "ACTIVE_HEALTHY") break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    // ── 3. Fetch API keys ──
    await setStage(workspaceId, "fetching_keys");
    const keysRes = await fetch(`${SUPABASE_MGMT_URL}/v1/projects/${projectRef}/api-keys`, {
      headers: mgmtHeaders(),
    });
    if (!keysRes.ok) throw new Error("Failed to fetch project API keys");

    const keys = (await keysRes.json()) as { name: string; api_key: string }[];
    const anonKey = keys.find((k) => k.name === "anon")?.api_key;
    const serviceRoleKey = keys.find((k) => k.name === "service_role")?.api_key;
    if (!anonKey || !serviceRoleKey) throw new Error("Missing API keys from project");

    const supabaseUrl = `https://${projectRef}.supabase.co`;

    await updateWorkspace(workspaceId, {
      supabase_project_ref: projectRef,
      supabase_url: supabaseUrl,
      supabase_anon_key: anonKey,
      supabase_service_role_key_enc: serviceRoleKey, // TODO: encrypt with pgsodium
      supabase_db_password_enc: dbPassword, // TODO: encrypt with pgsodium
    } as any);

    // ── 3b. Configure auth settings (site URL + redirect allowlist) ──
    const publicSiteUrl = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
    await fetch(`${SUPABASE_MGMT_URL}/v1/projects/${projectRef}/config/auth`, {
      method: "PATCH",
      headers: mgmtHeaders(),
      body: JSON.stringify({
        SITE_URL: publicSiteUrl,
        URI_ALLOW_LIST: `${publicSiteUrl}/auth/callback`,
      }),
    });

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
    if (authError) throw new Error(`Auth user creation failed: ${authError.message}`);

    // ── 5b. Initialize workspace via complete_setup() ──
    const meta = workspace.setup_metadata ?? {};
    const ownerName = meta.ownerName || "";
    const presetKey = meta.contextPreset || "other";
    const { stages, fields, streams } = resolvePreset(presetKey);

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

    // ── 5c. Set workspace modules based on preset ──
    const { modules } = resolvePreset(presetKey);
    if (modules) {
      await tenantClient
        .from("workspace")
        .update({ settings: { modules } })
        .eq("tenant_id", "00000000-0000-0000-0000-000000000000");
    }

    // ── 6. Spawn E2B sandbox ──
    await setStage(workspaceId, "starting_sandbox");

    const vncPassword = randomBytes(12).toString("base64url").slice(0, 12);

    const sandbox = await sandboxProvider.spawn({
      workspaceId,
      envs: {
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        VNC_PASSWORD: vncPassword,
        GATEWAY_ID: "default",
        GATEWAY_LABEL: workspace.label,
        TENANT_ID: "00000000-0000-0000-0000-000000000000",
      },
    });

    await updateWorkspace(workspaceId, {
      e2b_sandbox_id: sandbox.sandboxId,
      e2b_sandbox_status: "running",
      e2b_access_token: sandbox.accessToken,
      novnc_url: sandbox.novncUrl,
      vnc_password_enc: vncPassword, // TODO: encrypt
    } as any);

    // ── 7. Wait for gateway to register ──
    await setStage(workspaceId, "waiting_for_gateway");
    const gwStart = Date.now();
    while (Date.now() - gwStart < 120_000) {
      const { data } = await tenantClient
        .from("gateways")
        .select("id")
        .limit(1);
      if (data && data.length > 0) break;
      await new Promise((r) => setTimeout(r, 3000));
    }

    // ── 8. Done ──
    await updateWorkspace(workspaceId, {
      subscription_status: "active",
      provision_stage: "complete",
      e2b_sandbox_status: "running",
    } as any);

    await logSandboxEvent(workspaceId, "provisioned", {
      supabase_ref: projectRef,
      sandbox_id: sandbox.sandboxId,
    });

    const siteUrl = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
    sendProvisioningComplete(email, workspace.label, `${siteUrl}/login`).catch(
      (err) => console.error("[provisioner] Failed to send provisioning email:", err),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[provisioner] Failed for workspace ${workspaceId}:`, message);
    await setError(workspaceId, message);
    await logSandboxEvent(workspaceId, "error", { error: message });
    throw err;
  }
}
