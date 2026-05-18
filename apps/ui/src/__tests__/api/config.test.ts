import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/workspaces", () => ({
  getActiveWorkspace: vi.fn(),
}));

import { callRoute } from "../helpers/route-harness";
import { GET } from "@/app/api/config/route";
import { getActiveWorkspace } from "@/lib/workspaces";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/config", () => {
  test("returns workspace info when workspace exists", async () => {
    vi.mocked(getActiveWorkspace).mockResolvedValue({
      id: "ws-1",
      label: "My Workspace",
      emoji: "🏠",
      url: "https://my.supabase.co",
      anonKey: "anon-key-123",
    } as never);

    const { status, data } = await callRoute(GET);
    expect(status).toBe(200);
    const body = data as { workspace: Record<string, unknown> };
    expect(body.workspace).toEqual({
      workspaceId: "ws-1",
      label: "My Workspace",
      emoji: "🏠",
      url: "https://my.supabase.co",
      anonKey: "anon-key-123",
    });
  });

  test("returns { workspace: null } when no workspace", async () => {
    vi.mocked(getActiveWorkspace).mockResolvedValue(null as never);

    const { status, data } = await callRoute(GET);
    expect(status).toBe(200);
    const body = data as { workspace: null };
    expect(body.workspace).toBeNull();
  });

  test("returns { workspace: null } when getActiveWorkspace throws", async () => {
    vi.mocked(getActiveWorkspace).mockRejectedValue(new Error("No workspace configured"));

    const { status, data } = await callRoute(GET);
    expect(status).toBe(200);
    const body = data as { workspace: null };
    expect(body.workspace).toBeNull();
  });
});
