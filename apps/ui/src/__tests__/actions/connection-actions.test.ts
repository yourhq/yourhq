import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import {
  getServerClient,
  getAdminClient,
  resetServerMocks,
} from "@/__tests__/helpers/server-mock";

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/supabase/admin");

import {
  waitForCommand,
  refreshConnectionsAction,
  enqueueConnectionCommand,
} from "@/app/dashboard/settings/connections/actions";

beforeEach(() => {
  resetServerMocks();
  vi.useRealTimers();
});

describe("waitForCommand", () => {
  test("returns immediately when command is already done", async () => {
    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "agent_commands",
          {
            select: {
              data: [{ id: "cmd-1", status: "done", stdout: '{"ok":true}' }],
              error: null,
            },
          },
        ],
      ]),
    });

    const admin = getAdminClient();
    Object.assign(admin, adminMock);

    const result = await waitForCommand("cmd-1", 5000);
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe("done");
  });

  test("returns immediately when command has failed", async () => {
    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "agent_commands",
          {
            select: {
              data: [{ id: "cmd-1", status: "failed", error_message: "boom" }],
              error: null,
            },
          },
        ],
      ]),
    });

    const admin = getAdminClient();
    Object.assign(admin, adminMock);

    const result = await waitForCommand("cmd-1", 5000);
    expect(result.ok).toBe(true);
    expect(result.data?.status).toBe("failed");
  });

  test("returns error when Supabase query fails", async () => {
    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "agent_commands",
          {
            select: {
              data: null,
              error: { message: "Connection refused" },
            },
          },
        ],
      ]),
    });

    const admin = getAdminClient();
    Object.assign(admin, adminMock);

    const result = await waitForCommand("cmd-1", 1000);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection refused");
  });

  test("times out when command stays pending", async () => {
    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "agent_commands",
          {
            select: {
              data: [{ id: "cmd-1", status: "running" }],
              error: null,
            },
          },
        ],
      ]),
    });

    const admin = getAdminClient();
    Object.assign(admin, adminMock);

    const result = await waitForCommand("cmd-1", 600);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timeout");
  });
});

describe("enqueueConnectionCommand", () => {
  function setupMocks(overrides: {
    user?: { id: string; email: string } | null;
    insertData?: Record<string, unknown> | null;
    insertError?: { message: string } | null;
  } = {}) {
    const serverMock = createMockSupabaseClient({
      auth: {
        user: overrides.user !== undefined
          ? overrides.user
          : { id: "user-1", email: "test@example.com" },
      },
      tables: new Map([
        [
          "agent_commands",
          {
            insert: overrides.insertError
              ? { data: null, error: overrides.insertError }
              : {
                  data: overrides.insertData !== undefined
                    ? overrides.insertData
                      ? [overrides.insertData]
                      : []
                    : [{ id: "cmd-1" }],
                  error: null,
                },
          },
        ],
      ]),
    });

    const client = getServerClient();
    Object.assign(client, serverMock);
  }

  test("returns Unauthorized when no user session", async () => {
    setupMocks({ user: null });
    const result = await enqueueConnectionCommand({
      gatewayId: "gw-1",
      action: "auth_list",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  test("rejects non-connection action", async () => {
    setupMocks();
    const result = await enqueueConnectionCommand({
      gatewayId: "gw-1",
      action: "provision",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Not a connection action");
  });

  test("rejects missing gatewayId", async () => {
    setupMocks();
    const result = await enqueueConnectionCommand({
      gatewayId: "",
      action: "auth_list",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Missing gatewayId");
  });

  test("succeeds with valid connection action", async () => {
    setupMocks();
    const result = await enqueueConnectionCommand({
      gatewayId: "gw-1",
      action: "auth_list",
    });
    expect(result.ok).toBe(true);
    expect(result.data?.commandId).toBe("cmd-1");
  });

  test("succeeds with auth_set_api_key action", async () => {
    setupMocks();
    const result = await enqueueConnectionCommand({
      gatewayId: "gw-1",
      action: "auth_set_api_key",
      payload: { provider: "openai", apiKey: "sk-test" },
    });
    expect(result.ok).toBe(true);
  });

  test("returns error when insert fails", async () => {
    setupMocks({ insertError: { message: "Insert failed" } });
    const result = await enqueueConnectionCommand({
      gatewayId: "gw-1",
      action: "auth_list",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Insert failed");
  });
});

describe("refreshConnectionsAction", () => {
  test("returns error when enqueue fails (unauthorized)", async () => {
    const serverMock = createMockSupabaseClient({
      auth: { user: null },
    });
    const client = getServerClient();
    Object.assign(client, serverMock);

    const result = await refreshConnectionsAction("gw-1");
    expect(result.ok).toBe(false);
  });

  test("returns connections when command completes successfully", async () => {
    const serverMock = createMockSupabaseClient({
      auth: { user: { id: "user-1", email: "test@example.com" } },
      tables: new Map([
        [
          "agent_commands",
          {
            insert: { data: [{ id: "cmd-1" }], error: null },
          },
        ],
      ]),
    });

    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "agent_commands",
          {
            select: {
              data: [{
                id: "cmd-1",
                status: "done",
                stdout: JSON.stringify({
                  auth: {
                    oauth: [{ provider: "openai", reason: "ok", profile: "default" }],
                  },
                }),
              }],
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

    const result = await refreshConnectionsAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.connections).toHaveLength(1);
    expect(result.data?.connections[0].provider).toBe("openai");
  });

  test("returns error when command fails", async () => {
    const serverMock = createMockSupabaseClient({
      auth: { user: { id: "user-1", email: "test@example.com" } },
      tables: new Map([
        [
          "agent_commands",
          {
            insert: { data: [{ id: "cmd-1" }], error: null },
          },
        ],
      ]),
    });

    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "agent_commands",
          {
            select: {
              data: [{
                id: "cmd-1",
                status: "failed",
                error_message: "auth_list failed",
                stdout: null,
              }],
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

    const result = await refreshConnectionsAction("gw-1");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("auth_list failed");
  });
});
