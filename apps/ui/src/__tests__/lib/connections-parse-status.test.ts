import { describe, test, expect, vi, beforeEach } from "vitest";
import { parseModelsStatus } from "@/lib/connections/parse-status";

const GATEWAY = "gw-1";

describe("parseModelsStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00Z"));
  });

  test("returns empty for null input", () => {
    expect(parseModelsStatus(null, GATEWAY)).toEqual([]);
  });

  test("returns empty for undefined input", () => {
    expect(parseModelsStatus(undefined, GATEWAY)).toEqual([]);
  });

  test("returns empty for empty string", () => {
    expect(parseModelsStatus("", GATEWAY)).toEqual([]);
  });

  test("returns empty for invalid JSON", () => {
    expect(parseModelsStatus("{broken", GATEWAY)).toEqual([]);
  });

  test("returns empty for non-object JSON", () => {
    expect(parseModelsStatus('"hello"', GATEWAY)).toEqual([]);
  });

  test("returns empty when auth is missing", () => {
    expect(parseModelsStatus("{}", GATEWAY)).toEqual([]);
  });

  test("parses oauth array entries", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [
          {
            provider: "openai",
            profile: "default",
            profileId: "openai:default",
            status: "ok",
            reason: "ok",
            isDefault: true,
          },
        ],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("openai");
    expect(result[0].status).toBe("ok");
    expect(result[0].isDefault).toBe(true);
    expect(result[0].gatewayId).toBe(GATEWAY);
  });

  test("parses providers map with profiles array", () => {
    const stdout = JSON.stringify({
      auth: {
        providers: {
          anthropic: {
            profiles: [
              {
                profile: "work",
                profileId: "anthropic:work",
                reason: "ok",
                isDefault: false,
              },
            ],
          },
        },
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("anthropic:work");
    expect(result[0].provider).toBe("anthropic");
    expect(result[0].profileName).toBe("work");
    expect(result[0].status).toBe("ok");
  });

  test("parses provider-level entry without profiles", () => {
    const stdout = JSON.stringify({
      auth: {
        providers: {
          google: {
            reason: "missing_credential",
            isDefault: false,
          },
        },
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("google");
    expect(result[0].status).toBe("missing_credential");
  });

  test("maps expired reason", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "slack", reason: "expired" }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].status).toBe("expired");
  });

  test("maps invalid_expires to invalid", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "gh", reason: "invalid_expires" }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].status).toBe("invalid");
  });

  test("maps unresolved_ref to missing_credential", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "x", reason: "unresolved_ref" }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].status).toBe("missing_credential");
  });

  test("unknown reason maps to ok", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "test", reason: "something_else" }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].status).toBe("ok");
  });

  test("expires timestamp populates expiresAt", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [
          {
            provider: "openai",
            reason: "ok",
            expires: Math.floor(new Date("2025-12-01T00:00:00Z").getTime() / 1000),
          },
        ],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].expiresAt).toBe("2025-12-01T00:00:00.000Z");
    expect(result[0].status).toBe("ok");
  });

  test("token expiring within 24 hours sets status to expiring", () => {
    const soonEpoch = Math.floor(
      (new Date("2025-06-01T12:00:00Z").getTime() + 3600_000) / 1000
    );
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "openai", reason: "ok", expires: soonEpoch }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].status).toBe("expiring");
  });

  test("token already expired overrides ok status", () => {
    const pastEpoch = Math.floor(
      new Date("2025-05-01T00:00:00Z").getTime() / 1000
    );
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "openai", reason: "ok", expires: pastEpoch }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].status).toBe("expired");
  });

  test("deduplicates by profileId across oauth and providers", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [
          { provider: "openai", profileId: "openai:default", reason: "ok" },
        ],
        providers: {
          openai: {
            profiles: [
              {
                profile: "default",
                profileId: "openai:default",
                reason: "expired",
              },
            ],
          },
        },
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("expired");
  });

  test("generates profileId from provider:profile when missing", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "deepseek", profile: "main" }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].id).toBe("deepseek:main");
  });

  test("defaults profile name to default when empty", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ provider: "groq", profile: "" }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result[0].profileName).toBe("default");
  });

  test("skips entries without provider", () => {
    const stdout = JSON.stringify({
      auth: {
        oauth: [{ reason: "ok" }, { provider: "valid", reason: "ok" }],
      },
    });
    const result = parseModelsStatus(stdout, GATEWAY);
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe("valid");
  });
});
