import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const MAX_RETRIES = 3;
const STALE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const SUBSCRIPTION_PROVIDERS = new Set(["openai-codex", "github-copilot"]);

// Fallback per-million-token pricing when the runtime pricing function
// returns null. Keyed by bare model name (no provider prefix).
// Keep in sync with apps/ui/src/lib/models/catalog.ts.
const FALLBACK_PRICING: Record<string, { input_cost_per_million: number; output_cost_per_million: number; cache_read_cost_per_million?: number; cache_write_cost_per_million?: number }> = {
  "claude-opus-4-6":                      { input_cost_per_million: 15,    output_cost_per_million: 75,   cache_read_cost_per_million: 1.5,   cache_write_cost_per_million: 18.75 },
  "claude-sonnet-4-6":                    { input_cost_per_million: 3,     output_cost_per_million: 15,   cache_read_cost_per_million: 0.3,   cache_write_cost_per_million: 3.75 },
  "claude-haiku-4-5-20251001":            { input_cost_per_million: 0.8,   output_cost_per_million: 4,    cache_read_cost_per_million: 0.08,  cache_write_cost_per_million: 1 },
  "gpt-5.4":                              { input_cost_per_million: 2.5,   output_cost_per_million: 10,   cache_read_cost_per_million: 0.625 },
  "gpt-5.5":                              { input_cost_per_million: 5,     output_cost_per_million: 15,   cache_read_cost_per_million: 1.25 },
  "o3":                                   { input_cost_per_million: 10,    output_cost_per_million: 40,   cache_read_cost_per_million: 2.5 },
  "o4-mini":                              { input_cost_per_million: 1.1,   output_cost_per_million: 4.4,  cache_read_cost_per_million: 0.275 },
  "gemini-2.5-pro":                       { input_cost_per_million: 1.25,  output_cost_per_million: 10 },
  "gemini-2.5-flash":                     { input_cost_per_million: 0.15,  output_cost_per_million: 3.5 },
  "deepseek-chat":                        { input_cost_per_million: 0.27,  output_cost_per_million: 1.1,  cache_read_cost_per_million: 0.07 },
  "deepseek-reasoner":                    { input_cost_per_million: 0.55,  output_cost_per_million: 2.19, cache_read_cost_per_million: 0.14 },
  "mistral-large-latest":                 { input_cost_per_million: 2,     output_cost_per_million: 6 },
  "codestral-latest":                     { input_cost_per_million: 0.3,   output_cost_per_million: 0.9 },
  "MiniMax-M3":                           { input_cost_per_million: 0.6,   output_cost_per_million: 2.4,  cache_read_cost_per_million: 0.12, cache_write_cost_per_million: 0 },
  "grok-3":                               { input_cost_per_million: 3,     output_cost_per_million: 15 },
  "grok-3-mini":                          { input_cost_per_million: 0.3,   output_cost_per_million: 0.5 },
  "llama-4-scout-17b-16e-instruct":       { input_cost_per_million: 0.11,  output_cost_per_million: 0.34 },
  "llama-4-maverick-17b-128e-instruct":   { input_cost_per_million: 0.5,   output_cost_per_million: 0.77 },
};

// ── Supabase REST helpers ──────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const GATEWAY_DB_ID = process.env.GATEWAY_DB_ID ?? null;

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
}

async function supabasePost(table: string, row: Record<string, unknown>): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify(row),
    });
  } catch {
    // fire-and-forget
  }
}

async function supabaseGet<T = Record<string, unknown>>(
  table: string,
  params: Record<string, string>,
): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { ...supabaseHeaders(), Prefer: "" },
  });
  if (!res.ok) return [];
  return (await res.json()) as T[];
}

// ── Agent UUID cache (session → agent id) ──────────────────────

const agentIdCache = new Map<string, string>();

async function resolveAgentUuid(ctx: any): Promise<string | null> {
  const sessionId: string | undefined = ctx.sessionId;
  if (!sessionId) return null;

  const cached = agentIdCache.get(sessionId);
  if (cached) return cached;

  const slug = ctx.agentSlug || ctx.agentId;
  if (!slug) return null;

  try {
    const rows = await supabaseGet("agents", {
      select: "id",
      slug: `eq.${slug}`,
      limit: "1",
    });
    if (rows.length > 0) {
      const id = (rows[0] as any).id as string;
      agentIdCache.set(sessionId, id);
      return id;
    }
  } catch {
    // fail open
  }
  return null;
}

// ── Budget cache (agent_id → status) ───────────────────────────

interface BudgetCacheEntry {
  status: string;
  hardCutoff: boolean;
  fetchedAt: number;
}

const budgetCache = new Map<string, BudgetCacheEntry>();
const BUDGET_TTL_OK_MS = 30_000;
const BUDGET_TTL_EXCEEDED_MS = 5_000;

function invalidateBudgetCache(agentId: string) {
  budgetCache.delete(agentId);
}

async function fetchBudgetCached(agentId: string): Promise<BudgetCacheEntry | null> {
  const cached = budgetCache.get(agentId);
  if (cached) {
    const ttl = cached.status === "exceeded" ? BUDGET_TTL_EXCEEDED_MS : BUDGET_TTL_OK_MS;
    if (Date.now() - cached.fetchedAt < ttl) return cached;
  }

  try {
    const rows = await supabaseGet("agent_budgets", {
      select: "status,hard_cutoff",
      agent_id: `eq.${agentId}`,
      limit: "1",
    });
    if (rows.length === 0) return null;
    const row = rows[0] as any;
    const entry: BudgetCacheEntry = {
      status: row.status ?? "ok",
      hardCutoff: row.hard_cutoff !== false,
      fetchedAt: Date.now(),
    };
    budgetCache.set(agentId, entry);
    return entry;
  } catch {
    return null;
  }
}

function statePath(workspaceDir: string, sessionId: string) {
  return path.join(workspaceDir, "state", "session-bootstrap", `${sessionId}.json`);
}

function stateDir(workspaceDir: string) {
  return path.join(workspaceDir, "state", "session-bootstrap");
}

async function ensurePendingState(workspaceDir: string, sessionId: string, sessionKey?: string) {
  const file = statePath(workspaceDir, sessionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          status: "pending",
          sessionId,
          sessionKey: sessionKey || "",
          createdAt: new Date().toISOString(),
          retries: 0,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  }
}

async function loadState(workspaceDir: string, sessionId: string) {
  const file = statePath(workspaceDir, sessionId);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

interface WorkspaceConfig {
  modules: { crm: boolean };
  pipelineStages: { stage_key: string; label: string; is_terminal: boolean }[];
  fields: { field_key: string; field_type: string; label: string; options: string[] | null }[];
  streams: { name: string }[];
}

async function fetchWorkspaceConfig(): Promise<WorkspaceConfig | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const wsRows = await supabaseGet("workspace", { select: "settings", limit: "1" });
    const settings = (wsRows[0] as any)?.settings ?? {};
    const modules = settings.modules ?? { crm: true };

    const stageRows = await supabaseGet("pipeline_stages", {
      select: "stage_key,label,is_terminal",
      entity_type: "eq.contact",
      order: "sort_order.asc",
    });

    const fieldRows = await supabaseGet("field_definitions", {
      select: "field_key,field_type,label,options",
      entity_type: "eq.contact",
      "archived_at": "is.null",
      order: "sort_order.asc",
    });

    const streamRows = await supabaseGet("streams", {
      select: "name",
      order: "sort_order.asc",
    });

    return {
      modules,
      pipelineStages: stageRows as any[],
      fields: fieldRows as any[],
      streams: streamRows as any[],
    };
  } catch {
    return null;
  }
}

function renderWorkspaceBlock(config: WorkspaceConfig): string {
  const parts = ["", "## Your Workspace", ""];

  const enabled: string[] = [];
  const disabled: string[] = [];
  if (config.modules.crm) enabled.push("CRM");
  else disabled.push("CRM");

  parts.push(`**Modules enabled:** ${enabled.length > 0 ? enabled.join(", ") : "None"}`);
  if (disabled.length > 0) parts.push(`**Modules disabled:** ${disabled.join(", ")}`);

  if (config.modules.crm && config.pipelineStages.length > 0) {
    parts.push("");
    parts.push("### Contact Pipeline");
    const chain = config.pipelineStages
      .map((s) => s.is_terminal ? `${s.label} (final)` : s.label)
      .join(" → ");
    parts.push(chain);
  }

  if (config.modules.crm && config.fields.length > 0) {
    parts.push("");
    parts.push("### Contact Fields");
    for (const f of config.fields) {
      const opts = f.options && f.options.length > 0 ? `: ${f.options.join(", ")}` : "";
      parts.push(`- ${f.label} (${f.field_type})${opts}`);
    }
  }

  if (config.streams.length > 0) {
    parts.push("");
    parts.push("### Task Streams");
    for (const s of config.streams) {
      parts.push(`- ${s.name}`);
    }
  }

  parts.push("");
  if (config.modules.crm) {
    parts.push("When creating or updating contacts, use only the pipeline stages and fields listed above.");
  } else {
    parts.push("CRM is not enabled — do not create contacts or reference pipeline stages.");
  }

  return parts.join("\n");
}

interface OrgContext {
  manager: { name: string; slug: string; description: string | null } | null;
  reports: { name: string; slug: string; description: string | null; domains: string[] }[];
}

async function fetchOrgContext(agentId: string): Promise<OrgContext | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;

  try {
    const agentRows = await supabaseGet("agents", {
      select: "reports_to_id",
      id: `eq.${agentId}`,
      limit: "1",
    });
    if (agentRows.length === 0) return null;
    const reportsToId = (agentRows[0] as any).reports_to_id as string | null;

    let manager: OrgContext["manager"] = null;
    if (reportsToId) {
      const managerRows = await supabaseGet("agents", {
        select: "name,slug,description",
        id: `eq.${reportsToId}`,
        limit: "1",
      });
      if (managerRows.length > 0) {
        const m = managerRows[0] as any;
        manager = { name: m.name, slug: m.slug, description: m.description };
      }
    }

    const reportRows = await supabaseGet("agents", {
      select: "name,slug,description,domains",
      reports_to_id: `eq.${agentId}`,
    });
    const reports = (reportRows as any[]).map((r) => ({
      name: r.name,
      slug: r.slug,
      description: r.description,
      domains: r.domains ?? [],
    }));

    return { manager, reports };
  } catch {
    return null;
  }
}

function renderOrgBlock(agentName: string, agentSlug: string, org: OrgContext): string {
  const parts = [
    "",
    "## Your Position",
    "",
    `You are ${agentName} (@${agentSlug}).`,
  ];

  if (org.manager) {
    parts.push(`Manager: ${org.manager.name} (@${org.manager.slug})${org.manager.description ? ` — "${org.manager.description}"` : ""}`);
  } else {
    parts.push("Manager: Operator (your human).");
  }

  if (org.reports.length > 0) {
    parts.push("Direct reports:");
    for (const r of org.reports) {
      const domainStr = r.domains.length > 0 ? ` Domains: ${r.domains.join(", ")}.` : "";
      parts.push(`  - ${r.name} (@${r.slug}): ${r.description || "No description."}${domainStr}`);
    }
  } else {
    parts.push("Direct reports: None.");
  }

  if (org.reports.length > 0 || org.manager) {
    parts.push("");
    parts.push("Delegation rules:");
    parts.push("- You may delegate work to a direct report by creating a task assigned to them.");
    parts.push("- You may escalate to your manager by creating a task assigned to them with priority=high.");
    parts.push("- You may not assign work to peers without explicit human approval.");
  }

  return parts.join("\n");
}

function formatKindLabel(item: any): string {
  const kind = item.kind || "page";
  if (kind === "source" && item.provider) {
    return `source — ${item.provider}`;
  }
  return kind;
}

function renderBootContext(state: any) {
  const items = Array.isArray(state.knowledge) ? state.knowledge : [];
  const sources = Array.isArray(state.connectedSources) ? state.connectedSources : [];
  const parts = [
    "HQ bootstrap status: connected.",
    `Agent slug: ${state.agentSlug || "unknown"}.`,
    `Boot knowledge loaded: ${items.length}.`,
    "",
    "## HQ Boot Knowledge",
  ];

  const workspace = items.filter((i: any) => i.scope === "workspace");
  const agent = items.filter((i: any) => i.scope === "agent");

  if (workspace.length > 0) {
    parts.push("\n### Workspace Knowledge");
    for (const item of workspace) {
      parts.push(`\n#### ${item.title || "Untitled"} [${formatKindLabel(item)}]`);
      if (Array.isArray(item.tags) && item.tags.length) parts.push(`Tags: ${item.tags.join(", ")}`);
      if (item.content) parts.push(String(item.content));
    }
  }

  if (agent.length > 0) {
    parts.push("\n### Agent Knowledge");
    for (const item of agent) {
      parts.push(`\n#### ${item.title || "Untitled"} [${formatKindLabel(item)}]`);
      if (Array.isArray(item.tags) && item.tags.length) parts.push(`Tags: ${item.tags.join(", ")}`);
      if (item.content) parts.push(String(item.content));
    }
  }

  if (sources.length > 0) {
    parts.push("\n## Connected Sources");
    for (const src of sources) {
      const writeLabel = src.writable ? "writable" : "read-only";
      parts.push(`- ${src.provider} (${src.accountLabel}) — ${src.itemCount} items synced, ${writeLabel}`);
    }
  }

  return parts.join("\n");
}

async function cleanupStaleState(workspaceDir: string) {
  const dir = stateDir(workspaceDir);
  try {
    const entries = await fs.readdir(dir);
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const filePath = path.join(dir, entry);
      const stat = await fs.stat(filePath);
      if (now - stat.mtimeMs > STALE_AGE_MS) {
        await fs.unlink(filePath);
      }
    }
  } catch {
    // cleanup is best-effort
  }
}

export default definePluginEntry({
  id: "hq-bootstrap",
  name: "HQ Bootstrap",
  description: "Bootstraps HQ registration and boot-doc context for new sessions",
  register(api) {
    // ── Usage recording: log every LLM call to agent_usage ──
    api.on("llm_output", async (event: any, ctx: any) => {
      const agentId = await resolveAgentUuid(ctx);
      if (!agentId) return;

      const usage = event.usage ?? {};
      const model = event.model ?? "unknown";
      const provider = event.provider ?? "unknown";
      const isSubscription = SUBSCRIPTION_PROVIDERS.has(provider);

      // openclaw 5.x usage fields are camelCase (input/output/cacheRead/
      // cacheWrite/totalTokens) with a computed `cost` object.
      const inputTokens = usage.input ?? 0;
      const outputTokens = usage.output ?? 0;
      const cacheRead = usage.cacheRead ?? 0;
      const cacheWrite = usage.cacheWrite ?? 0;
      const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

      let costInput: number | null = null;
      let costOutput: number | null = null;
      let costCacheRead: number | null = null;
      let costCacheWrite: number | null = null;
      let costTotal: number | null = null;

      // Prefer the provider-supplied cost object — it's authoritative and
      // never goes stale. Fall back to our pricing table only when absent.
      const providerCost = usage.cost;

      if (isSubscription) {
        costInput = 0;
        costOutput = 0;
        costCacheRead = 0;
        costCacheWrite = 0;
        costTotal = 0;
      } else if (providerCost && typeof providerCost === "object") {
        costInput = providerCost.input ?? null;
        costOutput = providerCost.output ?? null;
        costCacheRead = providerCost.cacheRead ?? null;
        costCacheWrite = providerCost.cacheWrite ?? null;
        costTotal = providerCost.total
          ?? [costInput, costOutput, costCacheRead, costCacheWrite]
            .reduce<number | null>((acc, v) => (v == null ? acc : (acc ?? 0) + v), null);
      } else {
        try {
          let pricing = typeof (globalThis as any).getCachedGatewayModelPricing === "function"
            ? (globalThis as any).getCachedGatewayModelPricing(model)
            : null;
          if (!pricing) pricing = FALLBACK_PRICING[model] ?? null;
          if (pricing) {
            costInput = (inputTokens / 1_000_000) * (pricing.input_cost_per_million ?? 0);
            costOutput = (outputTokens / 1_000_000) * (pricing.output_cost_per_million ?? 0);
            costCacheRead = (cacheRead / 1_000_000) * (pricing.cache_read_cost_per_million ?? pricing.input_cost_per_million ?? 0);
            costCacheWrite = (cacheWrite / 1_000_000) * (pricing.cache_write_cost_per_million ?? pricing.input_cost_per_million ?? 0);
            costTotal = costInput + costOutput + costCacheRead + costCacheWrite;
          }
        } catch {
          // unmetered — cost stays null
        }
      }

      const sessionId = ctx.sessionId ?? "";
      const runId = event.runId ?? `${sessionId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

      const agentSlug = ctx.agentSlug || ctx.agentId || null;

      supabasePost("agent_usage", {
        agent_id: agentId,
        agent_slug_snapshot: agentSlug,
        gateway_id: GATEWAY_DB_ID,
        session_id: sessionId,
        run_id: runId,
        provider,
        model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read: cacheRead,
        cache_write: cacheWrite,
        total_tokens: totalTokens,
        cost_input_usd: costInput,
        cost_output_usd: costOutput,
        cost_cache_read_usd: costCacheRead,
        cost_cache_write_usd: costCacheWrite,
        cost_total_usd: costTotal,
        meta: isSubscription ? { subscription: true } : (costTotal != null ? {} : { unmetered: true }),
      });

      invalidateBudgetCache(agentId);
    });

    // ── Budget enforcement: block over-budget agents ──
    api.on("before_agent_reply", async (_event: any, ctx: any) => {
      const agentId = await resolveAgentUuid(ctx);
      if (!agentId) return;

      const budget = await fetchBudgetCached(agentId);
      if (budget && budget.status === "exceeded" && budget.hardCutoff) {
        return {
          handled: true,
          reply: {
            text: [
              "I've reached my usage budget for this billing period and can't process further requests right now.",
              "Please contact the workspace owner or visit the HQ dashboard to adjust my budget.",
            ].join("\n\n"),
          },
        };
      }
    });

    // ── Session bootstrap (existing) ──
    api.on("before_prompt_build", async (_event: any, ctx: any) => {
      const workspaceDir = ctx.workspaceDir || process.cwd();
      const sessionId = ctx.sessionId;
      const sessionKey = ctx.sessionKey || "";

      if (!sessionId) {
        console.warn("[cc-bootstrap] No sessionId in context — skipping bootstrap");
        return;
      }

      await ensurePendingState(workspaceDir, sessionId, sessionKey);
      let state = await loadState(workspaceDir, sessionId);

      // Don't retry if we've already exceeded the cap
      if (state.status === "error" && (state.retries || 0) >= MAX_RETRIES) {
        return {
          appendSystemContext: `HQ bootstrap failed after ${MAX_RETRIES} attempts: ${state.error || "unknown error"}. Bootstrap will not retry this session.`,
        };
      }

      if (state.status !== "done") {
        const scriptPath = path.join(workspaceDir, "scripts", "hq_session_bootstrap.py");
        try {
          await execFileAsync("python3", [scriptPath, "--session-id", sessionId, "--session-key", sessionKey], {
            cwd: workspaceDir,
            env: process.env,
          });
        } catch (err: any) {
          console.warn(`[cc-bootstrap] Bootstrap script failed: ${err.message || err}`);
        }
        state = await loadState(workspaceDir, sessionId);
      }

      // Fire-and-forget stale state cleanup
      cleanupStaleState(workspaceDir);

      if (state.status === "done") {
        let context = renderBootContext(state);

        const agentId = await resolveAgentUuid(ctx);
        if (agentId) {
          const org = await fetchOrgContext(agentId);
          if (org && (org.manager || org.reports.length > 0)) {
            const selfRows = await supabaseGet("agents", {
              select: "name,slug",
              id: `eq.${agentId}`,
              limit: "1",
            });
            const self = selfRows[0] as any;
            context += renderOrgBlock(
              self?.name || state.agentSlug || "unknown",
              self?.slug || state.agentSlug || "unknown",
              org,
            );
          }
        }

        const wsConfig = await fetchWorkspaceConfig();
        if (wsConfig) {
          context += renderWorkspaceBlock(wsConfig);
        }

        return { appendSystemContext: context };
      }

      if (state.status === "error") {
        const retries = state.retries || 0;
        const suffix = retries >= MAX_RETRIES ? " Bootstrap will not retry this session." : "";
        return {
          appendSystemContext: `HQ bootstrap failed (attempt ${retries}/${MAX_RETRIES}): ${state.error || "unknown error"}.${suffix}`,
        };
      }
    });
  },
});
