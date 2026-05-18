import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

async function importRoute() {
  return await import("@/app/api/onboarding/validate-provider/route");
}

describe("POST /api/onboarding/validate-provider", () => {
  test("returns 400 for malformed JSON body", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: "invalid{json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Invalid request body");
  });

  test("returns 400 when provider is missing", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ apiKey: "sk-test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Provider is required");
  });

  test("returns 400 for unsupported provider", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "gemini", apiKey: "test-key" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toContain("Unknown provider");
  });

  test("returns invalid when openai apiKey is missing", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "openai" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("API key is required");
  });

  test("validates openai key and returns filtered models", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: "gpt-4" },
            { id: "gpt-3.5-turbo" },
            { id: "dall-e-3" },
            { id: "whisper-1" },
            { id: "o3-mini" },
          ],
        }),
    });

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", apiKey: "sk-valid" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.models).toContain("gpt-4");
    expect(data.models).toContain("gpt-3.5-turbo");
    expect(data.models).toContain("o3-mini");
    expect(data.models).not.toContain("dall-e-3");
    expect(data.models).not.toContain("whisper-1");
  });

  test("returns invalid for bad openai key", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", apiKey: "sk-bad" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Invalid API key");
  });

  test("returns invalid when anthropic apiKey is missing", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "anthropic" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("API key is required");
  });

  test("validates anthropic key successfully", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-valid" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.models).toContain("claude-opus-4-6");
    expect(data.models).toContain("claude-sonnet-4-6");
    expect(data.models).toContain("claude-haiku-4-5-20251001");
  });

  test("returns invalid for bad anthropic key (401)", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-bad" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Invalid API key");
  });

  test("returns invalid for bad anthropic key (403)", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-forbidden" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Invalid API key");
  });

  test("validates ollama successfully", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          models: [{ name: "llama3:latest" }, { name: "codellama:7b" }],
        }),
    });

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "ollama" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(true);
    expect(data.models).toEqual(["llama3:latest", "codellama:7b"]);
  });

  test("returns invalid when ollama is not reachable", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "ollama" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toContain("Could not reach Ollama");
  });

  test("catches fetch errors and returns validation failed", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const req = new NextRequest("http://localhost/api/onboarding/validate-provider", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", apiKey: "sk-test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.valid).toBe(false);
    expect(data.error).toBe("Network error");
  });
});
