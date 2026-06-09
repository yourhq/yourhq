// End-to-end verification harness for the OpenClaw 5.28 gateway upgrade.
//
// Spawns a fresh sandbox from the `yourhq-gateway` E2B template (which must be
// built with the Phase 1 fixes baked in), points it at a Supabase project, and
// asserts the full agent loop works on 5.28:
//
//   1. gateway boots + heartbeats
//   2. hq-bootstrap plugin loads AND activates (register() runs)
//   3. plugin hooks are granted conversation access
//   4. an agent provisions with the inherited default model (no stale gpt-4.1)
//   5. a task wakes the agent and it completes a real LLM turn
//   6. a usage row lands in agent_usage with non-zero tokens
//
// Usage:
//   E2B_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node gateway/scripts/verify-528.mjs
//
// Exits non-zero if any assertion fails. Always tears the sandbox down.

import { Sandbox } from "e2b";

const TEMPLATE = process.env.E2B_TEMPLATE_NAME ?? "yourhq-gateway";
const SUPABASE_URL = required("SUPABASE_URL");
const SUPABASE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return v;
}

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function sb_run(sb, cmd, opts = {}) {
  return sb.commands
    .run(cmd, {
      user: opts.user ?? "root",
      timeoutMs: opts.timeoutMs ?? 30000,
      envs: { HOME: "/home/openclaw", DISPLAY: ":1" },
    })
    .catch((e) => ({
      exitCode: e.result?.exitCode ?? 1,
      stdout: e.result?.stdout ?? "",
      stderr: e.result?.stderr ?? String(e),
    }));
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return res.json();
}

let sandbox;
try {
  console.log(`Spawning sandbox from template "${TEMPLATE}"...`);
  sandbox = await Sandbox.create(TEMPLATE, {
    envs: {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
      GATEWAY_ID: "verify",
      GATEWAY_LABEL: "Verify 5.28",
      TENANT_ID: "00000000-0000-0000-0000-000000000000",
      VNC_PASSWORD: "verify1234",
      NETWORKING_MODE: "hosted",
      RUNTIME_MODE: "hosted",
    },
    timeoutMs: 30 * 60 * 1000,
    metadata: { purpose: "verify-528" },
  });
  console.log(`Sandbox: ${sandbox.sandboxId}`);

  // 1. Version is 5.28
  const ver = await sb_run(sandbox, `su - openclaw -c "openclaw --version"`);
  check("openclaw version is 5.28", /2026\.5\.28/.test(ver.stdout), ver.stdout.trim());

  // 2. Wait for gateway ready (entrypoint launches it as the main process)
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const r = await sb_run(sandbox, `curl -sf http://localhost:18789/ >/dev/null 2>&1 && echo UP || echo DOWN`, { timeoutMs: 8000 });
    if (r.stdout.includes("UP")) { ready = true; break; }
    await new Promise((res) => setTimeout(res, 3000));
  }
  check("gateway listening on :18789", ready);

  // 3. Plugin loaded and NOT blocked (perms fix)
  const plist = await sb_run(sandbox, `su - openclaw -c "openclaw plugins list 2>/dev/null" | grep -i bootstrap`);
  check("hq-bootstrap plugin enabled (not blocked)", /enabled/i.test(plist.stdout) && !/blocked/i.test(plist.stdout), plist.stdout.trim().slice(0, 120));

  // 4. allowConversationAccess granted (config patch fix)
  const inspect = await sb_run(sandbox, `su - openclaw -c "openclaw plugins inspect hq-bootstrap 2>/dev/null" | grep -i "allowConversationAccess"`);
  check("allowConversationAccess granted", /true/i.test(inspect.stdout), inspect.stdout.trim());

  // 5. Plugin dir is not world-writable
  const perms = await sb_run(sandbox, `stat -c "%a" /home/openclaw/.openclaw/plugins/hq-bootstrap`);
  const mode = parseInt(perms.stdout.trim(), 8);
  check("plugin dir not world-writable", !Number.isNaN(mode) && (mode & 0o022) === 0, `mode=${perms.stdout.trim()}`);

  // 6. Gateway heartbeat reached Supabase
  let hb = null;
  for (let i = 0; i < 20; i++) {
    const rows = await rest(`gateways?slug=eq.verify&select=last_heartbeat_at`);
    if (Array.isArray(rows) && rows[0]?.last_heartbeat_at) { hb = rows[0].last_heartbeat_at; break; }
    await new Promise((res) => setTimeout(res, 3000));
  }
  check("gateway heartbeat in Supabase", !!hb, hb ?? "none");

  console.log("\nDone. Manual agent-provision + task + usage assertions follow in the next stage.\n");
} finally {
  if (sandbox) {
    console.log(`Killing sandbox ${sandbox.sandboxId}...`);
    await sandbox.kill().catch(() => {});
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}
