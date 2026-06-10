import { describe, test, expect } from "vitest";
import {
  getProviderCatalog,
  getProviderCatalogForConnection,
  PROVIDER_CATALOG,
} from "@/lib/connections/types";

describe("getProviderCatalogForConnection", () => {
  // openclaw >=6.x reports both ChatGPT-OAuth and API-key credentials under
  // provider "openai"; the connection's authType disambiguates display.

  test("openai + oauth resolves to the ChatGPT catalog entry", () => {
    const entry = getProviderCatalogForConnection("openai", "oauth");
    expect(entry?.id).toBe("openai-codex");
    expect(entry?.displayName).toBe("OpenAI (ChatGPT)");
  });

  test("openai + api_key resolves to the API-key catalog entry", () => {
    const entry = getProviderCatalogForConnection("openai", "api_key");
    expect(entry?.id).toBe("openai");
    expect(entry?.displayName).toBe("OpenAI (API key)");
  });

  test("openai without authType falls back to the exact-id entry", () => {
    const entry = getProviderCatalogForConnection("openai");
    expect(entry?.id).toBe("openai");
  });

  test("legacy openai-codex id still resolves", () => {
    const entry = getProviderCatalogForConnection("openai-codex");
    expect(entry?.id).toBe("openai-codex");
  });

  test("google + oauth resolves to the Gemini CLI entry", () => {
    const entry = getProviderCatalogForConnection("google", "oauth");
    expect(entry?.id).toBe("google-gemini-cli");
  });

  test("google + api_key resolves to the base google entry", () => {
    const entry = getProviderCatalogForConnection("google", "api_key");
    expect(entry?.id).toBe("google");
  });

  test("single-entry providers resolve regardless of authType", () => {
    expect(getProviderCatalogForConnection("anthropic", "api_key")?.id).toBe("anthropic");
    expect(getProviderCatalogForConnection("anthropic", "oauth")?.id).toBe("anthropic");
    expect(getProviderCatalogForConnection("anthropic")?.id).toBe("anthropic");
  });

  test("unknown provider returns undefined", () => {
    expect(getProviderCatalogForConnection("nope")).toBeUndefined();
  });
});

describe("PROVIDER_CATALOG gateway mapping", () => {
  test("openai-codex maps to gateway provider openai", () => {
    expect(getProviderCatalog("openai-codex")?.gatewayProvider).toBe("openai");
  });

  test("google-gemini-cli maps to gateway provider google", () => {
    expect(getProviderCatalog("google-gemini-cli")?.gatewayProvider).toBe("google");
  });

  test("catalog ids are unique", () => {
    const ids = PROVIDER_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
