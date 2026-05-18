import { describe, test, expect, vi, beforeEach } from "vitest";
import { validateSupabaseCreds } from "@/lib/workspaces/validate";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

const VALID_INPUT = {
  url: "https://myproject.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.abc123def456",
  serviceRoleKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.xyz789",
};

describe("validateSupabaseCreds", () => {
  test("returns ok when probe succeeds", async () => {
    mockFetch(async () => new Response("[]", { status: 200 }));
    const result = await validateSupabaseCreds(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("rejects malformed anon key (too short)", async () => {
    const result = await validateSupabaseCreds({
      ...VALID_INPUT,
      anonKey: "short",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Publishable key");
  });

  test("rejects malformed service role key (too short)", async () => {
    const result = await validateSupabaseCreds({
      ...VALID_INPUT,
      serviceRoleKey: "tiny",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Secret key");
  });

  test("accepts new format sb_publishable_ keys", async () => {
    mockFetch(async () => new Response("[]", { status: 200 }));
    const result = await validateSupabaseCreds({
      ...VALID_INPUT,
      anonKey: "sb_publishable_abcdefghijklmnop",
    });
    expect(result.ok).toBe(true);
  });

  test("accepts new format sb_secret_ keys", async () => {
    mockFetch(async () => new Response("[]", { status: 200 }));
    const result = await validateSupabaseCreds({
      ...VALID_INPUT,
      serviceRoleKey: "sb_secret_abcdefghijklmnopqrs",
    });
    expect(result.ok).toBe(true);
  });

  test("returns error when URL is unreachable", async () => {
    mockFetch(async () => { throw new Error("ECONNREFUSED"); });
    const result = await validateSupabaseCreds(VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Could not reach");
  });

  test("returns error on 401 (bad key)", async () => {
    mockFetch(async () => new Response("", { status: 401 }));
    const result = await validateSupabaseCreds(VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Secret key rejected");
  });

  test("returns error on 403 (forbidden)", async () => {
    mockFetch(async () => new Response("", { status: 403 }));
    const result = await validateSupabaseCreds(VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Secret key rejected");
  });

  test("returns error on 404 (workspace table missing)", async () => {
    mockFetch(async () => new Response("", { status: 404 }));
    const result = await validateSupabaseCreds(VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("workspace table");
  });

  test("returns error on unexpected status code", async () => {
    mockFetch(async () => new Response("", { status: 503 }));
    const result = await validateSupabaseCreds(VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("503");
  });

  test("strips trailing slash from URL", async () => {
    const fetchFn = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);

    await validateSupabaseCreds({
      ...VALID_INPUT,
      url: "https://example.com/",
    });
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl.startsWith("https://example.com/rest")).toBe(true);
  });

  test("accepts keys with 20+ chars as benefit of the doubt", async () => {
    mockFetch(async () => new Response("[]", { status: 200 }));
    const result = await validateSupabaseCreds({
      ...VALID_INPUT,
      anonKey: "a".repeat(25),
      serviceRoleKey: "b".repeat(25),
    });
    expect(result.ok).toBe(true);
  });
});
