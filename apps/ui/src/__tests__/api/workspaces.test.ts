import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetServerMocks, getServerClient } from "../helpers/server-mock";
import "../helpers/server-mock";

vi.mock("@/lib/workspaces/registry", () => ({
  getRegistry: vi.fn().mockResolvedValue({
    workspaces: [],
    activeWorkspaceId: null,
  }),
  addWorkspace: vi.fn().mockResolvedValue({
    id: "ws-new",
    label: "New Workspace",
    emoji: "🚀",
    url: "https://new.supabase.co",
    anonKey: "a".repeat(20),
    isDefault: false,
    createdAt: new Date().toISOString(),
  }),
}));

vi.mock("@/lib/workspaces/hosted-registry", () => ({
  canAccessWorkspace: vi.fn().mockResolvedValue(false),
  createWorkspaceSessionValue: vi.fn().mockReturnValue("session-value"),
  HOSTED_SESSION_COOKIE: "hq_workspace_session",
}));

vi.mock("@/lib/workspaces/cookie", () => ({
  ACTIVE_WORKSPACE_COOKIE: "hq_active_workspace",
  ACTIVE_WORKSPACE_COOKIE_OPTIONS: {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  },
}));

beforeEach(() => {
  resetServerMocks();
  vi.clearAllMocks();
});

describe("GET /api/workspaces", () => {
  test("returns 401 when no user", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });

    const { GET } = await import("@/app/api/workspaces/route");
    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("returns registry when authenticated", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { getRegistry } = await import("@/lib/workspaces/registry");
    const mockRegistry = {
      workspaces: [{ id: "ws-1", label: "Test" }],
      activeWorkspaceId: "ws-1",
    };
    vi.mocked(getRegistry).mockResolvedValue(mockRegistry as never);

    const { GET } = await import("@/app/api/workspaces/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(mockRegistry);
  });
});

describe("POST /api/workspaces", () => {
  test("returns 401 when no user", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });

    const { POST } = await import("@/app/api/workspaces/route");
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  test("returns 400 for invalid body", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { POST } = await import("@/app/api/workspaces/route");
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ label: "Test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid body");
    expect(data.details).toBeDefined();
  });

  test("creates workspace and returns 201", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { POST } = await import("@/app/api/workspaces/route");
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({
        label: "My Workspace",
        emoji: "🚀",
        url: "https://my.supabase.co",
        anonKey: "a".repeat(20),
        serviceRoleKey: "s".repeat(20),
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.label).toBe("New Workspace");
  });
});
