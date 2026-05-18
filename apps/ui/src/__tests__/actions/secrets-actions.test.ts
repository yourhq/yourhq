import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import {
  getServerClient,
  getAdminClient,
  resetServerMocks,
} from "@/__tests__/helpers/server-mock";

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/supabase/admin");

vi.mock("@/lib/secrets/crypto", () => ({
  encryptSecret: vi.fn(async (v: string) => `encrypted:${v}`),
}));

vi.mock("@/lib/secrets/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/secrets/utils")>();
  return { ...actual };
});

import {
  createSecret,
  updateSecretValue,
  listSecretsForAgent,
} from "@/app/dashboard/settings/secrets/actions";

beforeEach(() => {
  resetServerMocks();
});

describe("createSecret", () => {
  function setupMocks(overrides: {
    user?: { id: string; email: string } | null;
    insertData?: Record<string, unknown> | null;
    insertError?: { message: string; code?: string } | null;
  } = {}) {
    const serverMock = createMockSupabaseClient({
      auth: {
        user: overrides.user !== undefined
          ? overrides.user
          : { id: "user-1", email: "test@example.com" },
      },
    });

    const secretRow = {
      id: "secret-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      gateway_id: "gw-1",
      agent_id: null,
      key: "MY_KEY",
      name: "My Key",
      category: "user",
      note: null,
      sync_status: "pending",
      last_synced_at: null,
    };

    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "secrets",
          {
            insert: overrides.insertError
              ? { data: null, error: overrides.insertError }
              : {
                  data: overrides.insertData !== undefined
                    ? overrides.insertData
                      ? [overrides.insertData]
                      : []
                    : [secretRow],
                  error: null,
                },
          },
        ],
      ]),
    });

    const client = getServerClient();
    Object.assign(client, serverMock);

    const admin = getAdminClient();
    Object.assign(admin, adminMock);

    return { serverMock, adminMock };
  }

  test("returns Unauthorized when no user session", async () => {
    setupMocks({ user: null });
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test",
      key: "TEST_KEY",
      value: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  test("rejects empty name", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "   ",
      key: "TEST_KEY",
      value: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Name is required.");
  });

  test("rejects empty value", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test Key",
      key: "TEST_KEY",
      value: "",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Value is required.");
  });

  test("rejects key that does not match pattern (lowercase)", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test",
      key: "my_key",
      value: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Variable name must start with a letter");
  });

  test("rejects key starting with a number", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test",
      key: "1INVALID",
      value: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Variable name must start with a letter");
  });

  test("rejects key with special characters", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test",
      key: "MY-KEY",
      value: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Variable name must start with a letter");
  });

  test("accepts valid uppercase key with underscores", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test Key",
      key: "MY_API_KEY_V2",
      value: "secret",
    });
    expect(result.ok).toBe(true);
    expect(result.data?.secret).toBeDefined();
  });

  test("derives key from name when key is empty", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "My API Key",
      key: "",
      value: "secret-value",
    });
    expect(result.ok).toBe(true);
  });

  test("returns duplicate error for code 23505", async () => {
    setupMocks({
      insertError: { message: "duplicate key", code: "23505" },
    });
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test",
      key: "DUPLICATE_KEY",
      value: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('already exists in this scope');
    expect(result.error).toContain("DUPLICATE_KEY");
  });

  test("returns generic error for non-duplicate DB errors", async () => {
    setupMocks({
      insertError: { message: "Connection lost", code: "08006" },
    });
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test",
      key: "SOME_KEY",
      value: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection lost");
  });

  test("passes agentId when provided", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      agentId: "agent-1",
      name: "Agent Secret",
      key: "AGENT_KEY",
      value: "secret",
    });
    expect(result.ok).toBe(true);
  });

  test("defaults category to 'user' when not provided", async () => {
    setupMocks();
    const result = await createSecret({
      gatewayId: "gw-1",
      name: "Test",
      key: "MY_KEY",
      value: "value",
    });
    expect(result.ok).toBe(true);
  });
});

describe("updateSecretValue", () => {
  function setupMocks(overrides: {
    user?: { id: string; email: string } | null;
    updateError?: { message: string } | null;
  } = {}) {
    const serverMock = createMockSupabaseClient({
      auth: {
        user: overrides.user !== undefined
          ? overrides.user
          : { id: "user-1", email: "test@example.com" },
      },
    });

    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "secrets",
          {
            update: overrides.updateError
              ? { data: null, error: overrides.updateError }
              : { data: [], error: null },
          },
        ],
      ]),
    });

    const client = getServerClient();
    Object.assign(client, serverMock);

    const admin = getAdminClient();
    Object.assign(admin, adminMock);
  }

  test("returns Unauthorized when no user session", async () => {
    setupMocks({ user: null });
    const result = await updateSecretValue("secret-1", "new-value");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  test("rejects empty value", async () => {
    setupMocks();
    const result = await updateSecretValue("secret-1", "");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Value is required.");
  });

  test("succeeds with valid value", async () => {
    setupMocks();
    const result = await updateSecretValue("secret-1", "new-secret");
    expect(result.ok).toBe(true);
  });

  test("returns error when Supabase update fails", async () => {
    setupMocks({ updateError: { message: "Update failed" } });
    const result = await updateSecretValue("secret-1", "new-value");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Update failed");
  });
});

describe("listSecretsForAgent", () => {
  function setupMocks(overrides: {
    user?: { id: string; email: string } | null;
    secrets?: Record<string, unknown>[];
    error?: { message: string } | null;
  } = {}) {
    const serverMock = createMockSupabaseClient({
      auth: {
        user: overrides.user !== undefined
          ? overrides.user
          : { id: "user-1", email: "test@example.com" },
      },
    });

    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "secrets",
          {
            select: overrides.error
              ? { data: null, error: overrides.error }
              : {
                  data: overrides.secrets ?? [],
                  error: null,
                },
          },
        ],
      ]),
    });

    const client = getServerClient();
    Object.assign(client, serverMock);

    const admin = getAdminClient();
    Object.assign(admin, adminMock);
  }

  test("returns Unauthorized when no user session", async () => {
    setupMocks({ user: null });
    const result = await listSecretsForAgent("agent-1", "gw-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  test("returns error when Supabase query fails", async () => {
    setupMocks({ error: { message: "Query failed" } });
    const result = await listSecretsForAgent("agent-1", "gw-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Query failed");
  });

  test("marks agent-scoped secrets with scope 'agent'", async () => {
    setupMocks({
      secrets: [
        { id: "s1", agent_id: "agent-1", key: "AGENT_KEY" },
      ],
    });
    const result = await listSecretsForAgent("agent-1", "gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.secrets[0].scope).toBe("agent");
  });

  test("marks gateway-level secrets (agent_id null) with scope 'gateway'", async () => {
    setupMocks({
      secrets: [
        { id: "s2", agent_id: null, key: "GW_KEY" },
      ],
    });
    const result = await listSecretsForAgent("agent-1", "gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.secrets[0].scope).toBe("gateway");
  });

  test("marks secrets belonging to a different agent as gateway scope", async () => {
    setupMocks({
      secrets: [
        { id: "s3", agent_id: "other-agent", key: "OTHER_KEY" },
      ],
    });
    const result = await listSecretsForAgent("agent-1", "gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.secrets[0].scope).toBe("gateway");
  });

  test("returns empty array when no secrets exist", async () => {
    setupMocks({ secrets: [] });
    const result = await listSecretsForAgent("agent-1", "gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.secrets).toEqual([]);
  });

  test("returns mixed scopes for agent and gateway secrets together", async () => {
    setupMocks({
      secrets: [
        { id: "s1", agent_id: "agent-1", key: "AGENT_SECRET" },
        { id: "s2", agent_id: null, key: "GW_SECRET" },
      ],
    });
    const result = await listSecretsForAgent("agent-1", "gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.secrets).toHaveLength(2);
    expect(result.data?.secrets[0].scope).toBe("agent");
    expect(result.data?.secrets[1].scope).toBe("gateway");
  });
});
