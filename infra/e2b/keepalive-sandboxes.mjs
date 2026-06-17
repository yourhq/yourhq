/**
 * E2B sandbox keepalive, health-check, backup, and auto-recovery.
 *
 * Cron: `0 * /3 * * *` (every 3 hours).
 *
 * Each run:
 *   1. Discover running sandboxes via Sandbox.list().
 *   2. Health-check each: connect + run a probe command.
 *   3. Extend healthy sandboxes to 24h.
 *   4. Once per day (00:00 UTC run): trigger a backup inside each sandbox.
 *   5. Dead/unhealthy sandboxes: auto-recover from latest backup.
 *
 * Requires:
 *   - E2B_API_KEY env var
 *   - workspaces.json sibling file with per-workspace config
 */

import { Sandbox } from "e2b";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_TTL = 24 * 60 * 60 * 1000;
const API_KEY = process.env.E2B_API_KEY;
if (!API_KEY) { console.error("E2B_API_KEY not set"); process.exit(1); }

const HEALTH_TIMEOUT = 15_000;
const BACKUP_TIMEOUT = 120_000;
const ENTRYPOINT_TIMEOUT = 180_000;

// ── Load workspace config ──────────────────────────────────────────

const configPath = join(__dirname, "workspaces.json");
if (!existsSync(configPath)) {
  console.error(`Missing ${configPath} — create it from workspaces.example.json`);
  process.exit(1);
}

const workspaces = JSON.parse(readFileSync(configPath, "utf-8"));

// State file: tracks last backup time per workspace.
const statePath = join(__dirname, ".keepalive-state.json");
let state = {};
try { state = JSON.parse(readFileSync(statePath, "utf-8")); } catch { /* first run */ }

function saveState() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function ts() { return new Date().toISOString(); }

// ── Health check ───────────────────────────────────────────────────

async function healthCheck(sandboxId) {
  try {
    const sb = await Sandbox.connect(sandboxId, { apiKey: API_KEY });
    const result = await sb.commands.run("pgrep -f 'openclaw gateway' > /dev/null && echo OK", {
      timeoutMs: HEALTH_TIMEOUT,
    });
    return result.stdout.trim().includes("OK");
  } catch (err) {
    console.error(ts(), `  health-check failed for ${sandboxId}: ${err.message}`);
    return false;
  }
}

// ── Trigger backup inside a sandbox ────────────────────────────────

async function triggerBackup(sandboxId, workspaceName) {
  try {
    const sb = await Sandbox.connect(sandboxId, { apiKey: API_KEY });

    // Ensure gateway_backup.py exists (may be missing on pre-v0.2.2 images).
    const repoRoot = resolve(__dirname, "../..");
    const backupPyLocal = join(repoRoot, "gateway/daemons/gateway_backup.py");
    if (existsSync(backupPyLocal)) {
      await sb.files.write(
        "/opt/yourhq/daemons/gateway_backup.py",
        readFileSync(backupPyLocal),
      );
    }

    console.log(ts(), `  triggering backup inside ${sandboxId} (${workspaceName}) ...`);
    const result = await sb.commands.run(
      "python3 /opt/yourhq/daemons/gateway_backup.py backup 2>&1",
      { timeoutMs: BACKUP_TIMEOUT }
    );
    const output = result.stdout.trim();
    if (output.includes('"ok": true') || output.includes('"ok":true')) {
      console.log(ts(), `  ✓ backup succeeded for ${workspaceName}`);
      state[workspaceName] = { lastBackup: new Date().toISOString() };
      saveState();
      return true;
    }
    console.error(ts(), `  ✗ backup returned non-ok for ${workspaceName}: ${output.slice(0, 200)}`);
    return false;
  } catch (err) {
    console.error(ts(), `  ✗ backup failed for ${workspaceName}: ${err.message}`);
    return false;
  }
}

// ── Auto-recovery: create new sandbox from backup ──────────────────
//
// E2B env-var race condition: the template's start_cmd (entrypoint.sh)
// begins before envd injects the `envs` we pass to Sandbox.create().
// The entrypoint sees empty SUPABASE_URL, thinks it's a template build,
// sleeps 30s, and exits. We must:
//   1. Create sandbox (entrypoint starts + exits harmlessly).
//   2. Wait for the entrypoint to finish exiting.
//   3. Upload gateway_backup.py + entrypoint.sh (may be missing in pre-v0.2.2 images).
//   4. Write .gateway-slug for persistent gateway ID.
//   5. Run the entrypoint in the background with env vars passed inline.
//   6. Wait for the gateway process to come up.

function buildEnvString(envs) {
  return Object.entries(envs)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}='${v.replace(/'/g, "'\\''")}'`)
    .join(" ");
}

async function recoverWorkspace(wsConfig) {
  const { name, template, envs } = wsConfig;
  console.log(ts(), `⟳ recovering workspace ${name} from backup ...`);

  const fullEnvs = {
    ...envs,
    RUNTIME_MODE: "hosted",
    TENANT_ID: envs.TENANT_ID || "00000000-0000-0000-0000-000000000000",
  };

  try {
    // Step 1: Create sandbox. The entrypoint will start but exit because
    // it won't see SUPABASE_URL in time. We pass envs anyway — they'll be
    // available for subsequent commands.run() calls.
    const sb = await Sandbox.create(template, {
      apiKey: API_KEY,
      timeoutMs: MAX_TTL,
      envs: fullEnvs,
      metadata: { workspace: name },
    });

    console.log(ts(), `  created sandbox ${sb.sandboxId} for ${name}`);

    // Step 2: Wait for the initial entrypoint to exit (it sleeps 30s then exits).
    console.log(ts(), `  waiting for initial entrypoint to exit ...`);
    await new Promise((r) => setTimeout(r, 35_000));

    // Step 3: Upload critical files that may be missing from pre-v0.2.2 images.
    // Without gateway_backup.py, the entrypoint can't restore from backup and
    // treats recovery as first boot — seeding templates and corrupting agents.
    console.log(ts(), `  uploading gateway scripts to sandbox ...`);
    const repoRoot = resolve(__dirname, "../..");
    const filesToUpload = [
      { local: "gateway/daemons/gateway_backup.py", remote: "/opt/yourhq/daemons/gateway_backup.py" },
      { local: "gateway/daemons/inbox_dispatcher.py", remote: "/opt/yourhq/daemons/inbox_dispatcher.py" },
      { local: "gateway/entrypoint.sh", remote: "/usr/local/bin/entrypoint.sh" },
    ];
    for (const { local, remote } of filesToUpload) {
      const localPath = join(repoRoot, local);
      if (existsSync(localPath)) {
        const content = readFileSync(localPath);
        await sb.files.write(remote, content);
        console.log(ts(), `    uploaded ${local}`);
      } else {
        console.warn(ts(), `    ⚠ ${local} not found locally, skipping`);
      }
    }
    await sb.commands.run("chmod +x /usr/local/bin/entrypoint.sh", { timeoutMs: 5_000 });

    // Step 4: Write .gateway-slug so the entrypoint picks up the right ID.
    const gatewayId = envs.GATEWAY_ID || "default";
    await sb.commands.run(
      `mkdir -p /home/openclaw/.openclaw && echo '${gatewayId}' > /home/openclaw/.openclaw/.gateway-slug`,
      { timeoutMs: 10_000 }
    );

    // Step 5: Run entrypoint in background with inline env vars.
    // setsid detaches from the E2B command session so it survives after
    // commands.run() returns. The entrypoint ends with `exec openclaw gateway run`
    // which is a long-running process.
    const envStr = buildEnvString(fullEnvs);
    console.log(ts(), `  starting entrypoint on ${sb.sandboxId} ...`);
    await sb.commands.run(
      `setsid bash -c '${envStr} /usr/local/bin/entrypoint.sh > /tmp/entrypoint.log 2>&1 &'`,
      { timeoutMs: 15_000 }
    );

    // Step 6: Wait for gateway to come up (entrypoint takes ~60-90s to
    // restore backup, set up VNC, install plugins, register, start gateway).
    console.log(ts(), `  waiting for gateway to start ...`);
    let healthy = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((r) => setTimeout(r, 15_000));
      healthy = await healthCheck(sb.sandboxId);
      if (healthy) break;
      console.log(ts(), `  still waiting (attempt ${attempt + 1}/12) ...`);
    }

    if (!healthy) {
      try {
        const logResult = await sb.commands.run("tail -50 /tmp/entrypoint.log 2>/dev/null", {
          timeoutMs: 10_000,
        });
        console.error(ts(), `  entrypoint tail:\n${logResult.stdout}`);
      } catch { /* ignore */ }
      console.error(ts(), `  ✗ gateway not healthy after recovery for ${name}`);
      return null;
    }

    console.log(ts(), `  ✓ workspace ${name} recovered on ${sb.sandboxId}`);
    return sb.sandboxId;
  } catch (err) {
    console.error(ts(), `  ✗ recovery failed for ${name}: ${err.message}`);
    return null;
  }
}

// ── Determine if we should run backups this cycle ──────────────────

function shouldRunBackups() {
  const hour = new Date().getUTCHours();
  // Run backups at the 00:00 and 12:00 UTC cycles (twice daily).
  return hour === 0 || hour === 12;
}

// ── Main ───────────────────────────────────────────────────────────

const page = Sandbox.list({ apiKey: API_KEY });
const items = await page.nextItems();

const runningByWorkspace = new Map();
for (const sb of items) {
  const ws = sb.metadata?.workspace;
  if (ws) {
    if (!runningByWorkspace.has(ws)) runningByWorkspace.set(ws, []);
    runningByWorkspace.get(ws).push(sb);
  } else {
    console.log(ts(), `⊘ ${sb.sandboxId} — no workspace metadata, skipping`);
  }
}

// Warn about duplicates.
for (const [ws, sbs] of runningByWorkspace) {
  if (sbs.length > 1) {
    console.warn(
      ts(),
      `⚠ ${ws} has ${sbs.length} sandboxes: ${sbs.map((s) => s.sandboxId).join(", ")}. ` +
        `Keeping newest, check others manually.`
    );
  }
}

const doBackups = shouldRunBackups();
if (doBackups) console.log(ts(), "📦 Backup cycle — will trigger backups on healthy sandboxes.");

// Process each workspace from config.
for (const wsConfig of workspaces) {
  const { name } = wsConfig;
  const sbs = runningByWorkspace.get(name) || [];
  const activeSb = sbs.length > 0
    ? sbs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0]
    : null;

  if (!activeSb) {
    console.log(ts(), `✗ ${name} — no running sandbox found.`);
    const newId = await recoverWorkspace(wsConfig);
    if (newId) {
      console.log(ts(), `✓ ${name} — recovered on ${newId}`);
    } else {
      console.error(ts(), `✗ ${name} — RECOVERY FAILED. Manual intervention needed.`);
    }
    continue;
  }

  const sbId = activeSb.sandboxId;

  // Resume paused sandboxes first.
  if (activeSb.state === "paused") {
    try {
      const res = await fetch(`https://api.e2b.dev/sandboxes/${sbId}/resume`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ timeoutMs: MAX_TTL }),
      });
      if (res.ok) {
        console.log(ts(), `↻ ${sbId} (${name}) — resumed + extended to 24h`);
      } else {
        const body = await res.text().catch(() => "");
        console.error(ts(), `✗ ${sbId} (${name}) resume failed: ${res.status} ${body}`);
        // If resume fails, the sandbox is likely dead. Try recovery.
        const newId = await recoverWorkspace(wsConfig);
        if (newId) console.log(ts(), `✓ ${name} — recovered on ${newId}`);
        continue;
      }
    } catch (err) {
      console.error(ts(), `✗ ${sbId} (${name}) resume error: ${err.message}`);
      continue;
    }
    // Give it a moment to fully resume before health check.
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Health check.
  const healthy = await healthCheck(sbId);
  if (!healthy) {
    console.error(ts(), `✗ ${sbId} (${name}) — UNHEALTHY. Attempting recovery ...`);
    const newId = await recoverWorkspace(wsConfig);
    if (newId) {
      console.log(ts(), `✓ ${name} — recovered on ${newId}`);
    } else {
      console.error(ts(), `✗ ${name} — RECOVERY FAILED.`);
    }
    continue;
  }

  // Extend timeout.
  try {
    await Sandbox.setTimeout(sbId, MAX_TTL, { apiKey: API_KEY });
    console.log(ts(), `✓ ${sbId} (${name}) — healthy, extended to 24h`);
  } catch (err) {
    console.error(ts(), `✗ ${sbId} (${name}) extend error: ${err.message}`);
  }

  // Backup (if it's a backup cycle).
  if (doBackups) {
    await triggerBackup(sbId, name);
  }
}

console.log(ts(), "Done.");
