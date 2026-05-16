import type { ModelEntry, ModelCatalogGroup } from "./types";

// ── Canonical model definitions ──────────────────────────────────────
// Each model appears once. The `provider` field is the canonical route
// used internally. When the user has multiple connections that serve the
// same model (e.g. openai API key AND openai-codex OAuth), the picker
// resolves which provider prefix to use at selection time.
//
// Pricing: per-million-token costs for budget tracking. The gateway
// plugin uses the runtime pricing function first and falls back to
// these values when unavailable.

const CURATED_MODELS: ModelEntry[] = [
  // Anthropic
  { id: "anthropic/claude-opus-4-6", displayName: "Claude Opus 4.6", provider: "anthropic", providerDisplayName: "Anthropic", pricing: { inputCostPerMillion: 15, outputCostPerMillion: 75, cacheReadCostPerMillion: 1.5, cacheWriteCostPerMillion: 18.75 } },
  { id: "anthropic/claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", provider: "anthropic", providerDisplayName: "Anthropic", pricing: { inputCostPerMillion: 3, outputCostPerMillion: 15, cacheReadCostPerMillion: 0.3, cacheWriteCostPerMillion: 3.75 } },
  { id: "anthropic/claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", provider: "anthropic", providerDisplayName: "Anthropic", pricing: { inputCostPerMillion: 0.8, outputCostPerMillion: 4, cacheReadCostPerMillion: 0.08, cacheWriteCostPerMillion: 1 } },

  // OpenAI — canonical entries use "openai/" prefix. The picker remaps
  // to "openai-codex/" when that's the only available connection.
  // Both paths serve the same model weights; the prefix is auth/billing only.
  { id: "openai/gpt-5.4", displayName: "GPT-5.4", provider: "openai", providerDisplayName: "OpenAI", pricing: { inputCostPerMillion: 2.5, outputCostPerMillion: 10, cacheReadCostPerMillion: 0.625 } },
  { id: "openai/gpt-5.5", displayName: "GPT-5.5", provider: "openai", providerDisplayName: "OpenAI", pricing: { inputCostPerMillion: 5, outputCostPerMillion: 15, cacheReadCostPerMillion: 1.25 } },
  { id: "openai/o3", displayName: "o3", provider: "openai", providerDisplayName: "OpenAI", pricing: { inputCostPerMillion: 10, outputCostPerMillion: 40, cacheReadCostPerMillion: 2.5 } },
  { id: "openai/o4-mini", displayName: "o4-mini", provider: "openai", providerDisplayName: "OpenAI", pricing: { inputCostPerMillion: 1.1, outputCostPerMillion: 4.4, cacheReadCostPerMillion: 0.275 } },
  // codex-mini: subscription-exclusive (optimized for agentic code tasks)
  { id: "openai-codex/codex-mini-latest", displayName: "Codex Mini", provider: "openai-codex", providerDisplayName: "OpenAI", exclusive: true, billing: "subscription" },

  // Google
  { id: "google/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "google", providerDisplayName: "Google", pricing: { inputCostPerMillion: 1.25, outputCostPerMillion: 10 } },
  { id: "google/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", provider: "google", providerDisplayName: "Google", pricing: { inputCostPerMillion: 0.15, outputCostPerMillion: 3.5 } },

  // DeepSeek
  { id: "deepseek/deepseek-chat", displayName: "DeepSeek V3", provider: "deepseek", providerDisplayName: "DeepSeek", pricing: { inputCostPerMillion: 0.27, outputCostPerMillion: 1.1, cacheReadCostPerMillion: 0.07 } },
  { id: "deepseek/deepseek-reasoner", displayName: "DeepSeek R1", provider: "deepseek", providerDisplayName: "DeepSeek", pricing: { inputCostPerMillion: 0.55, outputCostPerMillion: 2.19, cacheReadCostPerMillion: 0.14 } },

  // Mistral
  { id: "mistral/mistral-large-latest", displayName: "Mistral Large", provider: "mistral", providerDisplayName: "Mistral", pricing: { inputCostPerMillion: 2, outputCostPerMillion: 6 } },
  { id: "mistral/codestral-latest", displayName: "Codestral", provider: "mistral", providerDisplayName: "Mistral", pricing: { inputCostPerMillion: 0.3, outputCostPerMillion: 0.9 } },

  // xAI
  { id: "xai/grok-3", displayName: "Grok 3", provider: "xai", providerDisplayName: "xAI", pricing: { inputCostPerMillion: 3, outputCostPerMillion: 15 } },
  { id: "xai/grok-3-mini", displayName: "Grok 3 Mini", provider: "xai", providerDisplayName: "xAI", pricing: { inputCostPerMillion: 0.3, outputCostPerMillion: 0.5 } },

  // Groq
  { id: "groq/llama-4-scout-17b-16e-instruct", displayName: "Llama 4 Scout", provider: "groq", providerDisplayName: "Groq", pricing: { inputCostPerMillion: 0.11, outputCostPerMillion: 0.34 } },
  { id: "groq/llama-4-maverick-17b-128e-instruct", displayName: "Llama 4 Maverick", provider: "groq", providerDisplayName: "Groq", pricing: { inputCostPerMillion: 0.5, outputCostPerMillion: 0.77 } },

  // GitHub Copilot — separate group; distinct subscription + rate limits.
  { id: "github-copilot/gpt-5.4", displayName: "GPT-5.4", provider: "github-copilot", providerDisplayName: "GitHub Copilot", billing: "subscription" },
  { id: "github-copilot/claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", provider: "github-copilot", providerDisplayName: "GitHub Copilot", billing: "subscription" },
];

const MODEL_INDEX = new Map<string, ModelEntry>();
for (const m of CURATED_MODELS) MODEL_INDEX.set(m.id, m);

// ── Provider equivalence ─────────────────────────────────────────────
// Providers that serve the same models via different auth. When the user
// has any of these connected, they see models from the "canonical" group.
// The picker resolves the actual provider prefix at selection time.
//
// Key: canonical provider shown in UI.
// Value: list of provider IDs that can serve those models.
const PROVIDER_EQUIVALENTS: Record<string, string[]> = {
  openai: ["openai", "openai-codex"],
};

// Reverse map: given a connected provider ID, which canonical group does
// it unlock?
const PROVIDER_TO_CANONICAL = new Map<string, string>();
for (const [canonical, equivalents] of Object.entries(PROVIDER_EQUIVALENTS)) {
  for (const eq of equivalents) {
    PROVIDER_TO_CANONICAL.set(eq, canonical);
  }
}

export function getCuratedModels(): ModelEntry[] {
  return CURATED_MODELS;
}

// Human-readable labels for equivalent providers when both are connected.
const EQUIVALENT_LABELS: Record<string, string> = {
  "openai": "API",
  "openai-codex": "Subscription",
};

// When multiple routes exist, which one is the preferred default?
// Subscription is "free at the margin" so prefer it.
const EQUIVALENT_PREFERENCE: Record<string, string[]> = {
  openai: ["openai-codex", "openai"],
};

/**
 * Returns model groups for the model picker, handling provider equivalence.
 *
 * - Single connection: shows "OpenAI" group, no qualifiers.
 * - Both openai + openai-codex connected: shows each model twice with
 *   "via Subscription" (preferred) and "via API" labels so the user can
 *   choose which billing path to route through.
 *
 * @param connectedProviders - provider IDs of healthy connections
 */
export function getCuratedModelsForProviders(connectedProviders: string[]): ModelCatalogGroup[] {
  const connected = new Set(connectedProviders);
  const groups = new Map<string, ModelCatalogGroup>();

  for (const m of CURATED_MODELS) {
    const canonical = PROVIDER_TO_CANONICAL.get(m.provider) ?? m.provider;
    const equivalents = PROVIDER_EQUIVALENTS[canonical];

    // Exclusive models: only show when their specific provider is connected.
    // They never get remapped or duplicated across routes.
    if (m.exclusive) {
      if (!connected.has(m.provider)) continue;
      const groupKey = canonical;
      let group = groups.get(groupKey);
      if (!group) {
        group = { provider: groupKey, providerDisplayName: m.providerDisplayName, models: [] };
        groups.set(groupKey, group);
      }
      group.models.push(m);
      continue;
    }

    if (equivalents) {
      const connectedEquivalents = equivalents.filter((p) => connected.has(p));
      if (connectedEquivalents.length === 0) continue;

      const groupKey = canonical;
      let group = groups.get(groupKey);
      if (!group) {
        group = { provider: groupKey, providerDisplayName: m.providerDisplayName, models: [] };
        groups.set(groupKey, group);
      }

      if (connectedEquivalents.length === 1) {
        // Single route — no "via" label, clean display
        const resolvedProvider = connectedEquivalents[0];
        const modelName = m.id.split("/")[1];
        group.models.push({
          ...m,
          id: `${resolvedProvider}/${modelName}`,
          provider: resolvedProvider,
        });
      } else {
        // Multiple routes — emit one entry per route, preferred first
        const ordered = (EQUIVALENT_PREFERENCE[canonical] ?? connectedEquivalents)
          .filter((p) => connectedEquivalents.includes(p));
        for (const route of ordered) {
          const modelName = m.id.split("/")[1];
          group.models.push({
            ...m,
            id: `${route}/${modelName}`,
            provider: route,
            viaLabel: EQUIVALENT_LABELS[route] ?? route,
          });
        }
      }
    } else {
      if (!connected.has(m.provider)) continue;

      let group = groups.get(m.provider);
      if (!group) {
        group = { provider: m.provider, providerDisplayName: m.providerDisplayName, models: [] };
        groups.set(m.provider, group);
      }
      group.models.push(m);
    }
  }

  return Array.from(groups.values());
}

export function getModelDisplayName(modelId: string): string {
  const entry = MODEL_INDEX.get(modelId);
  if (entry) return entry.displayName;
  // Handle remapped IDs (e.g. "openai-codex/gpt-5.4" → look up "openai/gpt-5.4")
  const slash = modelId.indexOf("/");
  if (slash >= 0) {
    const provider = modelId.slice(0, slash);
    const modelName = modelId.slice(slash + 1);
    const canonical = PROVIDER_TO_CANONICAL.get(provider);
    if (canonical) {
      const canonicalEntry = MODEL_INDEX.get(`${canonical}/${modelName}`);
      if (canonicalEntry) return canonicalEntry.displayName;
    }
  }
  return slash >= 0 ? modelId.slice(slash + 1) : modelId;
}

export function getModelProvider(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash >= 0 ? modelId.slice(0, slash) : modelId;
}

/**
 * For display purposes, returns the canonical provider for UI icons/labels.
 * e.g. "openai-codex" → "openai", "github-copilot" → "github-copilot"
 */
export function getCanonicalProvider(providerId: string): string {
  return PROVIDER_TO_CANONICAL.get(providerId) ?? providerId;
}

export function getModelEntry(modelId: string): ModelEntry | null {
  const entry = MODEL_INDEX.get(modelId);
  if (entry) return entry;
  // Try canonical lookup for remapped IDs
  const slash = modelId.indexOf("/");
  if (slash >= 0) {
    const provider = modelId.slice(0, slash);
    const canonical = PROVIDER_TO_CANONICAL.get(provider);
    if (canonical) {
      return MODEL_INDEX.get(`${canonical}/${modelId.slice(slash + 1)}`) ?? null;
    }
  }
  return null;
}

export function makeCustomModelEntry(modelId: string): ModelEntry {
  const provider = getModelProvider(modelId);
  const displayName = getModelDisplayName(modelId);
  return {
    id: modelId,
    displayName,
    provider,
    providerDisplayName: provider,
  };
}

export const SUBSCRIPTION_PROVIDERS = new Set(["openai-codex", "github-copilot"]);

export const AGGREGATOR_PROVIDERS = new Set([
  "openrouter", "together", "fireworks", "huggingface", "deepinfra",
]);

export const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio", "vllm", "sglang"]);

export const ALL_KNOWN_PROVIDERS = [
  ...new Set(CURATED_MODELS.map((m) => m.provider)),
];
