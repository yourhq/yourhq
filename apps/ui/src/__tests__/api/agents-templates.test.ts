import { describe, test, expect, vi, beforeEach } from "vitest";
import { resetServerMocks, getServerClient } from "../helpers/server-mock";
import "../helpers/server-mock";

vi.mock("@/generated/templates", () => ({
  BUNDLED_TEMPLATES: [
    { branch: "template/analytics", name: "Analytics", emoji: "📊" },
    { branch: "template/assistant", name: "Assistant", emoji: "🧑‍💼" },
  ],
}));

beforeEach(() => {
  resetServerMocks();
  vi.clearAllMocks();
});

describe("GET /api/agents/templates", () => {
  test("returns 401 when no user", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });

    const { GET } = await import("@/app/api/agents/templates/route");
    const res = await GET();
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Unauthorized");
  });

  test("returns templates array when authenticated", async () => {
    const client = getServerClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "test@test.com" } },
      error: null,
    });

    const { GET } = await import("@/app/api/agents/templates/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([
      { branch: "template/analytics", name: "Analytics", emoji: "📊" },
      { branch: "template/assistant", name: "Assistant", emoji: "🧑‍💼" },
    ]);
  });
});
