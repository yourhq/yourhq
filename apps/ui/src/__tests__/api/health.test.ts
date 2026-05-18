import { describe, test, expect } from "vitest";
import { callRoute } from "../helpers/route-harness";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  test("returns 200", async () => {
    const { status } = await callRoute(GET);
    expect(status).toBe(200);
  });

  test("returns { ok: true, ts: string }", async () => {
    const { data } = await callRoute(GET);
    const body = data as { ok: boolean; ts: string };
    expect(body.ok).toBe(true);
    expect(typeof body.ts).toBe("string");
    expect(new Date(body.ts).toISOString()).toBe(body.ts);
  });
});
