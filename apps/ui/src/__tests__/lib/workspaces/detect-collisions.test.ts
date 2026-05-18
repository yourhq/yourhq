import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { detectCollisions } from "@/lib/workspaces/detect-collisions";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("detectCollisions", () => {
  const INPUT = { url: "https://myproject.supabase.co", serviceRoleKey: "sk_test" };

  test("returns 'unknown' when pg-meta is unreachable (404)", async () => {
    mockFetch(async () => new Response("", { status: 404 }));
    const result = await detectCollisions(INPUT);
    expect(result.status).toBe("unknown");
    expect(result.pgMetaUnreachable).toBe(true);
  });

  test("returns 'unknown' on non-OK response from pg-meta", async () => {
    mockFetch(async (_url, _init) => {
      const u = typeof _url === "string" ? _url : "";
      if (u.includes("/pg/meta/")) return new Response("", { status: 500 });
      return new Response("", { status: 404 });
    });
    const result = await detectCollisions(INPUT);
    expect(result.status).toBe("unknown");
  });

  test("returns 'clean' when no HQ tables exist", async () => {
    mockFetch(async () => new Response(JSON.stringify([]), { status: 200 }));
    const result = await detectCollisions(INPUT);
    expect(result.status).toBe("clean");
    expect(result.conflicts).toEqual([]);
    expect(result.installed).toEqual([]);
  });

  test("returns 'installed' when tables exist with correct columns", async () => {
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify([
            { table_name: "workspace" },
            { table_name: "agents" },
          ]),
          { status: 200 },
        );
      }
      if (callCount === 2) {
        return new Response(
          JSON.stringify([
            { column_name: "id" },
            { column_name: "name" },
            { column_name: "slug" },
            { column_name: "initialized" },
          ]),
          { status: 200 },
        );
      }
      if (callCount === 3) {
        return new Response(
          JSON.stringify([
            { column_name: "id" },
            { column_name: "slug" },
            { column_name: "gateway_id" },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const result = await detectCollisions(INPUT);
    expect(result.status).toBe("installed");
    expect(result.installed).toContain("workspace");
    expect(result.installed).toContain("agents");
    expect(result.conflicts).toEqual([]);
  });

  test("returns 'conflict' when table exists but columns mismatch", async () => {
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify([{ table_name: "workspace" }]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([{ column_name: "id" }, { column_name: "other_col" }]),
        { status: 200 },
      );
    });

    const result = await detectCollisions(INPUT);
    expect(result.status).toBe("conflict");
    expect(result.conflicts).toContain("workspace");
  });

  test("returns 'unknown' when column query fails", async () => {
    let callCount = 0;
    mockFetch(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify([{ table_name: "workspace" }]),
          { status: 200 },
        );
      }
      return new Response("", { status: 500 });
    });

    const result = await detectCollisions(INPUT);
    expect(result.status).toBe("unknown");
    expect(result.pgMetaUnreachable).toBe(false);
  });

  test("strips trailing slash from URL", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);

    await detectCollisions({ url: "https://example.com/", serviceRoleKey: "key" });
    const calledUrl = fetchFn.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain("//pg");
  });

  test("tries alternate pg-meta path on 404", async () => {
    const calls: string[] = [];
    mockFetch(async (url) => {
      calls.push(url);
      if (url.includes("/pg/meta/")) {
        return new Response("", { status: 404 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    await detectCollisions(INPUT);
    expect(calls.some((c) => c.includes("/api/pg-meta/"))).toBe(true);
  });
});
