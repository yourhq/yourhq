import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetServerMocks } from "../helpers/server-mock";
import { createMockSupabaseClient } from "../helpers/supabase-mock";
import "../helpers/server-mock";

const SERVICE_KEY = "test-service-role-key-12345";

beforeEach(() => {
  resetServerMocks();
  vi.clearAllMocks();
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
});

function authHeaders() {
  return { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
}

describe("GET /api/agents/[slug]/skills", () => {
  test("returns 401 without authorization header", async () => {
    const { GET } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "GET",
    });
    const res = await GET(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("returns 401 with wrong authorization token", async () => {
    const { GET } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "GET",
      headers: { Authorization: "Bearer wrong-key" },
    });
    const res = await GET(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(401);
  });

  test("returns 404 when agent is not found", async () => {
    const mockClient = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: null, error: { message: "not found" } } }],
      ]),
    });
    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(mockClient as never);

    const { GET } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/nonexistent/skills", {
      method: "GET",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const res = await GET(req, { params: Promise.resolve({ slug: "nonexistent" }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Agent not found");
  });

  test("returns empty array when agent has no skills", async () => {
    const mockClient = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: [{ id: "agent-1" }], error: null } }],
        ["knowledge_item_agents", { select: { data: [], error: null } }],
      ]),
    });
    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(mockClient as never);

    const { GET } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "GET",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const res = await GET(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  test("returns skills for agent", async () => {
    const skills = [
      { id: "skill-1", title: "Skill One", kind: "skill", scope: "agent", plain_text: "content", updated_at: "2024-01-01", created_at: "2024-01-01" },
    ];

    const agentQueryBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in", "neq"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.single = vi.fn().mockResolvedValue({ data: { id: "agent-1" }, error: null });
      return b;
    })();

    const junctionQueryBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in", "neq"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: [{ knowledge_item_id: "skill-1" }], error: null }).then(resolve);
      return b;
    })();

    const itemsQueryBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in", "neq"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: skills, error: null }).then(resolve);
      return b;
    })();

    const mockClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "agents") return agentQueryBuilder;
        if (table === "knowledge_item_agents") return junctionQueryBuilder;
        if (table === "knowledge_items") return itemsQueryBuilder;
        return agentQueryBuilder;
      }),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(mockClient as never);

    const { GET } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "GET",
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const res = await GET(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(skills);
  });
});

describe("POST /api/agents/[slug]/skills", () => {
  test("returns 401 without authorization", async () => {
    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({ title: "test", content: "test", action: "create", reason: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(401);
  });

  test("returns 400 when title is missing", async () => {
    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({ content: "test", action: "create", reason: "test" }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("title is required");
  });

  test("returns 400 when content is missing", async () => {
    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({ title: "test", action: "create", reason: "test" }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("content is required");
  });

  test("returns 400 when action is invalid", async () => {
    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({ title: "test", content: "test", action: "delete", reason: "test" }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("action must be 'create' or 'update'");
  });

  test("returns 400 when action is update but knowledge_item_id is missing", async () => {
    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({ title: "test", content: "test", action: "update", reason: "test" }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("knowledge_item_id is required for updates");
  });

  test("returns 404 when agent is not found for create", async () => {
    const mockClient = createMockSupabaseClient({
      tables: new Map([
        ["agents", { select: { data: null, error: { message: "not found" } } }],
      ]),
    });
    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(mockClient as never);

    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/nonexistent/skills", {
      method: "POST",
      body: JSON.stringify({ title: "test", content: "test content", action: "create", reason: "learning" }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "nonexistent" }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Agent not found");
  });

  test("creates a new skill successfully", async () => {
    const agentBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.single = vi.fn().mockResolvedValue({ data: { id: "agent-1", name: "Test Agent", slug: "test-agent" }, error: null });
      return b;
    })();

    const insertBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.insert = vi.fn().mockReturnValue(b);
      b.single = vi.fn().mockResolvedValue({ data: { id: "skill-new" }, error: null });
      return b;
    })();

    const junctionBuilder = (() => {
      const b: Record<string, unknown> = {};
      b.insert = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return b;
    })();

    const auditBuilder = (() => {
      const b: Record<string, unknown> = {};
      b.insert = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return b;
    })();

    const mockClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "agents") return agentBuilder;
        if (table === "knowledge_items") return insertBuilder;
        if (table === "knowledge_item_agents") return junctionBuilder;
        if (table === "audit_log") return auditBuilder;
        return agentBuilder;
      }),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(mockClient as never);

    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({ title: "New Skill", content: "Skill content", action: "create", reason: "Learned from experience" }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("skill-new");
    expect(data.action).toBe("created");
  });

  test("updates an existing skill successfully", async () => {
    const agentBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.single = vi.fn().mockResolvedValue({ data: { id: "agent-1", name: "Test Agent", slug: "test-agent" }, error: null });
      return b;
    })();

    const updateBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.update = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ error: null }).then(resolve);
      return b;
    })();

    const auditBuilder = (() => {
      const b: Record<string, unknown> = {};
      b.insert = vi.fn().mockReturnValue(b);
      b.then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return b;
    })();

    const mockClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "agents") return agentBuilder;
        if (table === "knowledge_items") return updateBuilder;
        if (table === "audit_log") return auditBuilder;
        return agentBuilder;
      }),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(mockClient as never);

    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({
        title: "Updated Skill",
        content: "Updated content",
        action: "update",
        knowledge_item_id: "skill-existing",
        reason: "Improved understanding",
      }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("skill-existing");
    expect(data.action).toBe("updated");
  });

  test("returns 500 when knowledge_items insert fails", async () => {
    const agentBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.single = vi.fn().mockResolvedValue({ data: { id: "agent-1", name: "Test Agent", slug: "test-agent" }, error: null });
      return b;
    })();

    const insertBuilder = (() => {
      const b: Record<string, unknown> = {};
      const chain = ["select", "eq", "order", "limit", "is", "in"];
      for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
      b.insert = vi.fn().mockReturnValue(b);
      b.single = vi.fn().mockResolvedValue({ data: null, error: { message: "Insert failed" } });
      return b;
    })();

    const mockClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "agents") return agentBuilder;
        if (table === "knowledge_items") return insertBuilder;
        return agentBuilder;
      }),
    };

    const { createAdminClient } = await import("@/lib/supabase/admin");
    vi.mocked(createAdminClient).mockResolvedValue(mockClient as never);

    const { POST } = await import("@/app/api/agents/[slug]/skills/route");
    const req = new NextRequest("http://localhost/api/agents/test-agent/skills", {
      method: "POST",
      body: JSON.stringify({ title: "Fail Skill", content: "content", action: "create", reason: "test" }),
      headers: authHeaders(),
    });
    const res = await POST(req, { params: Promise.resolve({ slug: "test-agent" }) });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Insert failed");
  });
});
