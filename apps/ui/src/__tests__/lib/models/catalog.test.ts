import { describe, test, expect } from "vitest";
import {
  getCuratedModels,
  getCuratedModelsForProviders,
  getModelDisplayName,
  getModelProvider,
  getCanonicalProvider,
  getModelEntry,
  makeCustomModelEntry,
  SUBSCRIPTION_PROVIDERS,
  AGGREGATOR_PROVIDERS,
  LOCAL_PROVIDERS,
  ALL_KNOWN_PROVIDERS,
} from "@/lib/models/catalog";

describe("getCuratedModels", () => {
  test("returns a non-empty array of model entries", () => {
    const models = getCuratedModels();
    expect(models.length).toBeGreaterThan(0);
  });

  test("each model has required fields", () => {
    for (const m of getCuratedModels()) {
      expect(m.id).toBeTruthy();
      expect(m.displayName).toBeTruthy();
      expect(m.provider).toBeTruthy();
      expect(m.providerDisplayName).toBeTruthy();
    }
  });

  test("model IDs follow provider/model-name format", () => {
    for (const m of getCuratedModels()) {
      expect(m.id).toContain("/");
    }
  });
});

describe("getModelDisplayName", () => {
  test("returns display name for known model", () => {
    expect(getModelDisplayName("anthropic/claude-opus-4-6")).toBe("Claude Opus 4.6");
  });

  test("returns display name for remapped provider", () => {
    expect(getModelDisplayName("openai-codex/gpt-5.4")).toBe("GPT-5.4");
  });

  test("returns model part for unknown model with slash", () => {
    expect(getModelDisplayName("unknown/my-model")).toBe("my-model");
  });

  test("returns full string for unknown model without slash", () => {
    expect(getModelDisplayName("somemodel")).toBe("somemodel");
  });
});

describe("getModelProvider", () => {
  test("extracts provider from model ID", () => {
    expect(getModelProvider("anthropic/claude-opus-4-6")).toBe("anthropic");
    expect(getModelProvider("openai/gpt-5.4")).toBe("openai");
  });

  test("returns full string if no slash", () => {
    expect(getModelProvider("standalone")).toBe("standalone");
  });
});

describe("getCanonicalProvider", () => {
  test("maps openai-codex to openai", () => {
    expect(getCanonicalProvider("openai-codex")).toBe("openai");
  });

  test("passes through non-equivalent providers", () => {
    expect(getCanonicalProvider("anthropic")).toBe("anthropic");
    expect(getCanonicalProvider("google")).toBe("google");
    expect(getCanonicalProvider("github-copilot")).toBe("github-copilot");
  });
});

describe("getModelEntry", () => {
  test("finds entry for known model", () => {
    const entry = getModelEntry("anthropic/claude-opus-4-6");
    expect(entry).not.toBeNull();
    expect(entry!.displayName).toBe("Claude Opus 4.6");
  });

  test("finds entry via canonical lookup for remapped provider", () => {
    const entry = getModelEntry("openai-codex/gpt-5.4");
    expect(entry).not.toBeNull();
    expect(entry!.displayName).toBe("GPT-5.4");
  });

  test("returns null for unknown model", () => {
    expect(getModelEntry("unknown/nonexistent")).toBeNull();
  });
});

describe("makeCustomModelEntry", () => {
  test("creates entry for unknown model", () => {
    const entry = makeCustomModelEntry("custom/my-model");
    expect(entry.id).toBe("custom/my-model");
    expect(entry.displayName).toBe("my-model");
    expect(entry.provider).toBe("custom");
    expect(entry.providerDisplayName).toBe("custom");
  });

  test("creates entry for known model (uses known display name)", () => {
    const entry = makeCustomModelEntry("anthropic/claude-opus-4-6");
    expect(entry.displayName).toBe("Claude Opus 4.6");
  });
});

describe("getCuratedModelsForProviders", () => {
  test("returns empty when no providers connected", () => {
    const groups = getCuratedModelsForProviders([]);
    expect(groups).toHaveLength(0);
  });

  test("returns anthropic models when anthropic is connected", () => {
    const groups = getCuratedModelsForProviders(["anthropic"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].provider).toBe("anthropic");
    expect(groups[0].models.length).toBeGreaterThan(0);
  });

  test("returns multiple groups for multiple providers", () => {
    const groups = getCuratedModelsForProviders(["anthropic", "google"]);
    const providers = groups.map((g) => g.provider);
    expect(providers).toContain("anthropic");
    expect(providers).toContain("google");
  });

  test("openai connection shows openai models with openai prefix", () => {
    const groups = getCuratedModelsForProviders(["openai"]);
    const openaiGroup = groups.find((g) => g.provider === "openai");
    expect(openaiGroup).toBeDefined();
    for (const m of openaiGroup!.models) {
      expect(m.id.startsWith("openai/")).toBe(true);
    }
  });

  test("openai-codex connection shows models with openai-codex prefix", () => {
    const groups = getCuratedModelsForProviders(["openai-codex"]);
    const group = groups.find((g) => g.provider === "openai");
    expect(group).toBeDefined();
    const nonExclusive = group!.models.filter((m) => !m.exclusive);
    for (const m of nonExclusive) {
      expect(m.id.startsWith("openai-codex/")).toBe(true);
    }
  });

  test("both openai + openai-codex shows duplicate entries with viaLabel", () => {
    const groups = getCuratedModelsForProviders(["openai", "openai-codex"]);
    const group = groups.find((g) => g.provider === "openai");
    expect(group).toBeDefined();

    const gpt54Models = group!.models.filter((m) => m.displayName === "GPT-5.4");
    expect(gpt54Models.length).toBe(2);
    const labels = gpt54Models.map((m) => m.viaLabel).sort();
    expect(labels).toEqual(["API", "Subscription"]);
  });

  test("exclusive models only appear when their specific provider is connected", () => {
    const withCodex = getCuratedModelsForProviders(["openai-codex"]);
    const group = withCodex.find((g) => g.provider === "openai");
    const exclusiveModels = group?.models.filter((m) => m.exclusive) ?? [];
    expect(exclusiveModels.length).toBeGreaterThan(0);

    const withoutCodex = getCuratedModelsForProviders(["openai"]);
    const group2 = withoutCodex.find((g) => g.provider === "openai");
    const exclusive2 = group2?.models.filter((m) => m.exclusive) ?? [];
    expect(exclusive2).toHaveLength(0);
  });

  test("github-copilot models appear in their own group", () => {
    const groups = getCuratedModelsForProviders(["github-copilot"]);
    const group = groups.find((g) => g.provider === "github-copilot");
    expect(group).toBeDefined();
    expect(group!.models.length).toBeGreaterThan(0);
  });
});

describe("provider constant sets", () => {
  test("SUBSCRIPTION_PROVIDERS contains expected providers", () => {
    expect(SUBSCRIPTION_PROVIDERS.has("openai-codex")).toBe(true);
    expect(SUBSCRIPTION_PROVIDERS.has("github-copilot")).toBe(true);
    expect(SUBSCRIPTION_PROVIDERS.has("openai")).toBe(false);
  });

  test("AGGREGATOR_PROVIDERS contains expected providers", () => {
    expect(AGGREGATOR_PROVIDERS.has("openrouter")).toBe(true);
    expect(AGGREGATOR_PROVIDERS.has("together")).toBe(true);
  });

  test("LOCAL_PROVIDERS contains expected providers", () => {
    expect(LOCAL_PROVIDERS.has("ollama")).toBe(true);
    expect(LOCAL_PROVIDERS.has("lmstudio")).toBe(true);
  });

  test("ALL_KNOWN_PROVIDERS is a non-empty array with no duplicates", () => {
    expect(ALL_KNOWN_PROVIDERS.length).toBeGreaterThan(0);
    expect(new Set(ALL_KNOWN_PROVIDERS).size).toBe(ALL_KNOWN_PROVIDERS.length);
  });
});
