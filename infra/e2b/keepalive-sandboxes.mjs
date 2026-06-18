/**
 * E2B sandbox keepalive, health-check, backup, and auto-recovery.
 *
 * Two cron schedules on the EC2 host:
 *
 *   # Health check — every 20 minutes
 *   *​/20 * * * *  cd ~/yourhq && E2B_API_KEY=... node infra/e2b/keepalive-sandboxes.mjs >> ~/keepalive-sandboxes.log 2>&1
 *
 *   # Daily renewal + backup — 02:00 UTC
 *   0 2 * * *     cd ~/yourhq && E2B_API_KEY=... node infra/e2b/keepalive-sandboxes.mjs --renew >> ~/keepalive-sandboxes.log 2>&1
 *
 * Health-check runs (default, no flags):
 *   - Discover running/paused sandboxes.
 *   - Resume any found paused (e.g. left paused by a failed renewal).
 *   - Health-check each: is the gateway process alive?
 *   - Dead → auto-recover from latest backup.
 *   - Safety net: if remaining lifetime < 3h, force backup + renewal.
 *
 * Renewal runs (--renew flag):
 *   - Backup all healthy sandboxes first.
 *   - Pause/resume each to reset the 24h lifetime clock.
 *   - Health-check after resume to confirm processes survived.
 *
 * Backup-only runs (--backup flag, e.g. 14:00 UTC midday snapshot):
 *   - Health-check + backup all healthy sandboxes. No renewal.
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

const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TTL_S = 24 * 60 * 60;
// Safety net: force-renew if a sandbox has less than this remaining.
// With 20-min health checks, 3h gives 9 chances to catch it.
const SAFETY_THRESHOLD_MS = 3 * 60 * 60 * 1000;
const API_KEY = process.env.E2B_API_KEY;
if (!API_KEY) { console.error("E2B_API_KEY not set"); process.exit(1); }

const HEALTH_TIMEOUT = 15_000;
const BACKUP_TIMEOUT = 120_000;

const MODE_RENEW = process.argv.includes("--renew");
const MODE_BACKUP = process.argv.includes("--backup");

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

// ── Pause/resume to renew the 24h lifetime ─────────────────────────

async function renewViaPauseResume(sandboxId, name) {
  try {
    const sb = await Sandbox.connect(sandboxId, { apiKey: API_KEY });
    console.log(ts(), `  pausing ${sandboxId} (${name}) ...`);
    await sb.pause();

    console.log(ts(), `  resuming ${sandboxId} (${name}) with 24h timeout ...`);
    const res = await fetch(`https://api.e2b.dev/sandboxes/${sandboxId}/resume`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ timeout: MAX_TTL_S }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(ts(), `  ✗ resume failed for ${sandboxId}: ${res.status} ${body}`);
      return false;
    }

    // Verify the new endAt
    const page = Sandbox.list({ apiKey: API_KEY });
    const items = await page.nextItems();
    const renewed = items.find((s) => s.sandboxId === sandboxId);
    if (renewed) {
      const newRemaining = ((new Date(renewed.endAt).getTime() - Date.now()) / 3600000).toFixed(1);
      console.log(ts(), `  ✓ ${sandboxId} (${name}) renewed — ${newRemaining}h remaining`);
    }

    await new Promise((r) => setTimeout(r, 5_000));

    const healthy = await healthCheck(sandboxId);
    if (!healthy) {
      console.error(ts(), `  ⚠ ${sandboxId} (${name}) unhealthy after resume — may need recovery`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(ts(), `  ✗ pause/resume failed for ${sandboxId} (${name}): ${err.message}`);
    return false;
  }
}

// ── Trigger backup inside a sandbox ────────────────────────────────

async function triggerBackup(sandboxId, workspaceName) {
  try {
    const sb = await Sandbox.connect(sandboxId, { apiKey: API_KEY });

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
    const sb = await Sandbox.create(template, {
      apiKey: API_KEY,
      timeoutMs: MAX_TTL_MS,
      envs: fullEnvs,
      metadata: { workspace: name },
    });

    console.log(ts(), `  created sandbox ${sb.sandboxId} for ${name}`);

    console.log(ts(), `  waiting for initial entrypoint to exit ...`);
    await new Promise((r) => setTimeout(r, 35_000));

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

    const gatewayId = envs.GATEWAY_ID || "default";
    await sb.commands.run(
      `mkdir -p /home/openclaw/.openclaw && echo '${gatewayId}' > /home/openclaw/.openclaw/.gateway-slug`,
      { timeoutMs: 10_000 }
    );

    const sandboxHost = `${sb.sandboxId}.e2b.app`;
    await sb.commands.run(`echo '${sandboxHost}' > /tmp/sandbox-host`, { timeoutMs: 5_000 });

    const envStr = buildEnvString(fullEnvs);
    console.log(ts(), `  starting entrypoint on ${sb.sandboxId} ...`);
    await sb.commands.run(
      `setsid bash -c '${envStr} /usr/local/bin/entrypoint.sh > /tmp/entrypoint.log 2>&1 &'`,
      { timeoutMs: 15_000 }
    );

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

// ── Main ───────────────────────────────────────────────────────────

if (MODE_RENEW) {
  console.log(ts(), "🔄 Renewal run — backup all, then pause/resume all.");
} else if (MODE_BACKUP) {
  console.log(ts(), "📦 Backup run — health-check + backup all.");
} else {
  console.log(ts(), "🩺 Health-check run.");
}

const page = Sandbox.list({ apiKey: API_KEY });
const items = await page.nextItems();

const byWorkspace = new Map();
for (const sb of items) {
  const ws = sb.metadata?.workspace;
  if (ws) {
    if (!byWorkspace.has(ws)) byWorkspace.set(ws, []);
    byWorkspace.get(ws).push(sb);
  } else {
    console.log(ts(), `⊘ ${sb.sandboxId} — no workspace metadata, skipping`);
  }
}

for (const [ws, sbs] of byWorkspace) {
  if (sbs.length > 1) {
    console.warn(
      ts(),
      `⚠ ${ws} has ${sbs.length} sandboxes: ${sbs.map((s) => s.sandboxId).join(", ")}. ` +
        `Keeping newest, check others manually.`
    );
  }
}

for (const wsConfig of workspaces) {
  const { name } = wsConfig;
  const sbs = byWorkspace.get(name) || [];
  const activeSb = sbs.length > 0
    ? sbs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0]
    : null;

  // ── No sandbox found → recover from backup ──
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

  // ── Resume paused sandboxes (left over from a failed renewal) ──
  if (activeSb.state === "paused") {
    try {
      const res = await fetch(`https://api.e2b.dev/sandboxes/${sbId}/resume`, {
        method: "POST",
        headers: { "X-API-Key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ timeout: MAX_TTL_S }),
      });
      if (res.ok) {
        console.log(ts(), `↻ ${sbId} (${name}) — resumed with 24h timeout`);
      } else {
        const body = await res.text().catch(() => "");
        console.error(ts(), `✗ ${sbId} (${name}) resume failed: ${res.status} ${body}`);
        const newId = await recoverWorkspace(wsConfig);
        if (newId) console.log(ts(), `✓ ${name} — recovered on ${newId}`);
        continue;
      }
    } catch (err) {
      console.error(ts(), `✗ ${sbId} (${name}) resume error: ${err.message}`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  // ── Health check ──
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

  const endAt = activeSb.endAt ? new Date(activeSb.endAt).getTime() : Infinity;
  const remaining = endAt - Date.now();
  const remainH = (remaining / 3600000).toFixed(1);

  // ── Renewal run (--renew): backup first, then pause/resume ──
  if (MODE_RENEW) {
    await triggerBackup(sbId, name);
    console.log(ts(), `⏰ ${sbId} (${name}) — renewing (${remainH}h was remaining) ...`);
    const renewed = await renewViaPauseResume(sbId, name);
    if (!renewed) {
      console.error(ts(), `  ✗ pause/resume failed for ${name}. Falling back to recovery ...`);
      const newId = await recoverWorkspace(wsConfig);
      if (newId) {
        console.log(ts(), `✓ ${name} — recovered on ${newId}`);
      } else {
        console.error(ts(), `✗ ${name} — RECOVERY FAILED.`);
      }
    }
    continue;
  }

  // ── Backup run (--backup): backup only ──
  if (MODE_BACKUP) {
    await triggerBackup(sbId, name);
    console.log(ts(), `✓ ${sbId} (${name}) — healthy, ${remainH}h remaining`);
    continue;
  }

  // ── Regular health-check run: safety net for missed renewals ──
  if (remaining < SAFETY_THRESHOLD_MS) {
    console.log(ts(), `⚠ ${sbId} (${name}) — only ${remainH}h remaining! Safety-net renewal ...`);
    await triggerBackup(sbId, name);
    const renewed = await renewViaPauseResume(sbId, name);
    if (!renewed) {
      console.error(ts(), `  ✗ safety-net renewal failed for ${name}. Falling back to recovery ...`);
      const newId = await recoverWorkspace(wsConfig);
      if (newId) {
        console.log(ts(), `✓ ${name} — recovered on ${newId}`);
      } else {
        console.error(ts(), `✗ ${name} — RECOVERY FAILED. Sandbox expires in ${remainH}h.`);
      }
    }
    continue;
  }

  console.log(ts(), `✓ ${sbId} (${name}) — healthy, ${remainH}h remaining`);
}

console.log(ts(), "Done.");
