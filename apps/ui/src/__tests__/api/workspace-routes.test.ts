import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetServerMocks, getServerClient } from "../helpers/server-mock";
import "../helpers/server-mock";

const mockTargetAuth = {
  getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
};
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: mockTargetAuth })),
}));

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
  getWorkspace: vi.fn(),
  setActiveWorkspace: vi.fn(),
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
  test("returns 401 when user is not authenticated", async () => {
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

  test("returns the workspace registry when authenticated", async () => {
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
  test("returns 401 when user is not authenticated", async () => {
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

  test("returns 400 for malformed JSON", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { POST } = await import("@/app/api/workspaces/route");
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: "not-json{{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid body");
  });

  test("returns 400 when required fields are missing", async () => {
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

  test("returns 400 for invalid URL format", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { POST } = await import("@/app/api/workspaces/route");
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({
        label: "Test",
        emoji: "🏠",
        url: "not-a-url",
        anonKey: "a".repeat(20),
        serviceRoleKey: "s".repeat(20),
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid body");
  });

  test("returns 400 when anonKey is too short", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { POST } = await import("@/app/api/workspaces/route");
    const req = new NextRequest("http://localhost/api/workspaces", {
      method: "POST",
      body: JSON.stringify({
        label: "Test",
        emoji: "🏠",
        url: "https://valid.supabase.co",
        anonKey: "short",
        serviceRoleKey: "s".repeat(20),
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 201 with valid workspace data", async () => {
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

describe("POST /api/workspaces/switch", () => {
  test("returns 400 for malformed JSON", async () => {
    const { POST } = await import("@/app/api/workspaces/switch/route");
    const req = new NextRequest("http://localhost/api/workspaces/switch", {
      method: "POST",
      body: "bad-json{{",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid body");
  });

  test("returns 400 when workspaceId is not a UUID", async () => {
    const { POST } = await import("@/app/api/workspaces/switch/route");
    const req = new NextRequest("http://localhost/api/workspaces/switch", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "not-a-uuid" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid body");
  });

  test("returns 401 when user is not authenticated (OSS mode)", async () => {
    const { getWorkspace } = await import("@/lib/workspaces/registry");
    vi.mocked(getWorkspace).mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "Test Workspace",
      url: "https://test.supabase.co",
      anonKey: "test-anon-key-that-is-long-enough",
    } as never);

    mockTargetAuth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });

    const { POST } = await import("@/app/api/workspaces/switch/route");
    const req = new NextRequest("http://localhost/api/workspaces/switch", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "550e8400-e29b-41d4-a716-446655440000" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("returns 404 when workspace does not exist (OSS mode)", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { getWorkspace } = await import("@/lib/workspaces/registry");
    vi.mocked(getWorkspace).mockResolvedValue(null);

    const { POST } = await import("@/app/api/workspaces/switch/route");
    const req = new NextRequest("http://localhost/api/workspaces/switch", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "550e8400-e29b-41d4-a716-446655440000" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Workspace not found");
  });

  test("switches workspace successfully (OSS mode)", async () => {
    mockTargetAuth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { getWorkspace, setActiveWorkspace } = await import("@/lib/workspaces/registry");
    vi.mocked(getWorkspace).mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "Test Workspace",
      url: "https://test.supabase.co",
      anonKey: "test-anon-key-that-is-long-enough",
    } as never);
    vi.mocked(setActiveWorkspace).mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/workspaces/switch/route");
    const req = new NextRequest("http://localhost/api/workspaces/switch", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "550e8400-e29b-41d4-a716-446655440000" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.workspaceId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});
