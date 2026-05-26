import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/require-auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "test-user", email: "test@example.com" }),
  UnauthenticatedError: class UnauthenticatedError extends Error {
    constructor() { super("Unauthorized"); this.name = "UnauthenticatedError"; }
  },
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

async function importRoute() {
  return await import("@/app/api/embed/route");
}

describe("POST /api/embed", () => {
  test("returns 400 for missing body", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/embed", {
      method: "POST",
      body: "not json{{{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_body");
  });

  test("returns 400 for missing input", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/embed", {
      method: "POST",
      body: JSON.stringify({ something: "else" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("input_required");
  });

  test("returns embedder response on success", async () => {
    const { POST } = await importRoute();
    const mockEmbedding = { embedding: [0.1, 0.2, 0.3] };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEmbedding),
    });

    const req = new NextRequest("http://localhost/api/embed", {
      method: "POST",
      body: JSON.stringify({ input: "hello world" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(mockEmbedding);
  });

  test("returns 502 when embedder fails", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const req = new NextRequest("http://localhost/api/embed", {
      method: "POST",
      body: JSON.stringify({ input: "hello world" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("embedder_error");
  });

  test("returns 504 on timeout", async () => {
    const { POST } = await importRoute();
    const timeoutError = new DOMException("The operation was aborted.", "TimeoutError");
    globalThis.fetch = vi.fn().mockRejectedValue(timeoutError);

    const req = new NextRequest("http://localhost/api/embed", {
      method: "POST",
      body: JSON.stringify({ input: "hello world" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(504);
    const data = await res.json();
    expect(data.error).toBe("embedder_timeout");
  });
});
