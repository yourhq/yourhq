import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetServerMocks, getServerClient } from "../helpers/server-mock";
import "../helpers/server-mock";

vi.mock("@/lib/workspaces/validate", () => ({
  validateSupabaseCreds: vi.fn(),
}));

beforeEach(() => {
  resetServerMocks();
  vi.clearAllMocks();
});

describe("POST /api/workspaces/validate", () => {
  test("returns 401 when no user", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });

    const { POST } = await import("@/app/api/workspaces/validate/route");
    const req = new NextRequest("http://localhost/api/workspaces/validate", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("returns 400 for invalid body", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { POST } = await import("@/app/api/workspaces/validate/route");
    const req = new NextRequest("http://localhost/api/workspaces/validate", {
      method: "POST",
      body: JSON.stringify({ url: "not-a-url" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid body");
    expect(data.details).toBeDefined();
  });

  test("returns 400 when validation fails", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { validateSupabaseCreds } = await import("@/lib/workspaces/validate");
    vi.mocked(validateSupabaseCreds).mockResolvedValue({
      ok: false,
      error: "Cannot connect",
      hint: "Check your URL",
    } as never);

    const { POST } = await import("@/app/api/workspaces/validate/route");
    const req = new NextRequest("http://localhost/api/workspaces/validate", {
      method: "POST",
      body: JSON.stringify({
        url: "https://my.supabase.co",
        anonKey: "a".repeat(20),
        serviceRoleKey: "s".repeat(20),
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Cannot connect");
    expect(data.hint).toBe("Check your URL");
  });

  test("returns { ok: true } when valid", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { validateSupabaseCreds } = await import("@/lib/workspaces/validate");
    vi.mocked(validateSupabaseCreds).mockResolvedValue({ ok: true } as never);

    const { POST } = await import("@/app/api/workspaces/validate/route");
    const req = new NextRequest("http://localhost/api/workspaces/validate", {
      method: "POST",
      body: JSON.stringify({
        url: "https://my.supabase.co",
        anonKey: "a".repeat(20),
        serviceRoleKey: "s".repeat(20),
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
