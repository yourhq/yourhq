import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
});

async function importRoute() {
  return await import("@/app/api/embed/route");
}

describe("POST /api/embed", () => {
  test("returns 400 with invalid_body for malformed JSON", async () => {
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

  test("returns 400 with input_required when input is missing", async () => {
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

  test("returns 400 with input_required when input is empty string", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/embed", {
      method: "POST",
      body: JSON.stringify({ input: "   " }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("input_required");
  });

  test("proxies to embedder and returns embedding on success", async () => {
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
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/embed"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("returns 502 when embedder returns non-ok response", async () => {
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
    expect(data.detail).toBe("Internal Server Error");
  });

  test("returns 502 when embedder is unreachable", async () => {
    const { POST } = await importRoute();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const req = new NextRequest("http://localhost/api/embed", {
      method: "POST",
      body: JSON.stringify({ input: "hello world" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toBe("embedder_unavailable");
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
