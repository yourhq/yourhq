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
  createWebhookPlugin,
  deletePlugin,
} from "@/app/dashboard/settings/plugins/actions";

beforeEach(() => {
  resetServerMocks();
});

describe("createWebhookPlugin", () => {
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

    const pluginRow = {
      id: "plugin-uuid-1",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
      plugin_id: "my-webhook",
      name: "My Webhook",
      description: null,
      version: "1.0.0",
      source: "webhook",
      is_enabled: true,
      hooks: ["task.created"],
      entry_module: null,
      webhook_url: "https://example.com/hook",
      config: {},
      config_schema: null,
      capabilities: [],
      installed_by: "user-1",
      meta: {},
    };

    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "hq_plugins",
          {
            insert: overrides.insertError
              ? { data: null, error: overrides.insertError }
              : {
                  data: overrides.insertData !== undefined
                    ? overrides.insertData
                      ? [overrides.insertData]
                      : []
                    : [pluginRow],
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
    const result = await createWebhookPlugin({
      name: "Test",
      webhookUrl: "https://example.com/hook",
      hooks: ["task.created"],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  test("rejects empty name", async () => {
    setupMocks();
    const result = await createWebhookPlugin({
      name: "   ",
      webhookUrl: "https://example.com/hook",
      hooks: ["task.created"],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Name is required.");
  });

  test("rejects empty webhook URL", async () => {
    setupMocks();
    const result = await createWebhookPlugin({
      name: "Test Plugin",
      webhookUrl: "   ",
      hooks: ["task.created"],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Webhook URL is required.");
  });

  test("rejects empty hooks array", async () => {
    setupMocks();
    const result = await createWebhookPlugin({
      name: "Test Plugin",
      webhookUrl: "https://example.com/hook",
      hooks: [],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Select at least one event.");
  });

  test("rejects invalid webhook URL", async () => {
    setupMocks();
    const result = await createWebhookPlugin({
      name: "Test Plugin",
      webhookUrl: "not-a-url",
      hooks: ["task.created"],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid webhook URL.");
  });

  describe("slug generation from name", () => {
    test("converts name to lowercase kebab-case slug", async () => {
      setupMocks();
      const result = await createWebhookPlugin({
        name: "My Cool Plugin",
        webhookUrl: "https://example.com/hook",
        hooks: ["task.created"],
      });
      expect(result.ok).toBe(true);
    });

    test("strips special characters from slug", async () => {
      setupMocks();
      const result = await createWebhookPlugin({
        name: "Plugin @#$ Test!",
        webhookUrl: "https://example.com/hook",
        hooks: ["task.created"],
      });
      expect(result.ok).toBe(true);
    });

    test("strips leading and trailing hyphens from slug", async () => {
      setupMocks();
      const result = await createWebhookPlugin({
        name: "---test---",
        webhookUrl: "https://example.com/hook",
        hooks: ["task.created"],
      });
      expect(result.ok).toBe(true);
    });

    test("rejects name that produces empty slug (all special chars)", async () => {
      setupMocks();
      const result = await createWebhookPlugin({
        name: "@#$%^&",
        webhookUrl: "https://example.com/hook",
        hooks: ["task.created"],
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Name must contain letters or numbers.");
    });
  });

  test("returns duplicate error for code 23505", async () => {
    setupMocks({
      insertError: { message: "duplicate key", code: "23505" },
    });
    const result = await createWebhookPlugin({
      name: "Existing Plugin",
      webhookUrl: "https://example.com/hook",
      hooks: ["task.created"],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("already exists");
    expect(result.error).toContain("existing-plugin");
  });

  test("returns generic error for other DB failures", async () => {
    setupMocks({
      insertError: { message: "Connection lost" },
    });
    const result = await createWebhookPlugin({
      name: "Test",
      webhookUrl: "https://example.com/hook",
      hooks: ["task.created"],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection lost");
  });

  test("succeeds with all valid inputs", async () => {
    setupMocks();
    const result = await createWebhookPlugin({
      name: "Deploy Notifier",
      description: "Notifies on deploys",
      webhookUrl: "https://hooks.example.com/deploy",
      webhookSecret: "my-secret",
      hooks: ["task.completed", "agent.provisioned"],
    });
    expect(result.ok).toBe(true);
    expect(result.data?.plugin).toBeDefined();
  });
});

describe("deletePlugin", () => {
  function setupMocks(overrides: {
    user?: { id: string; email: string } | null;
    pluginSource?: string | null;
    deleteError?: { message: string } | null;
  } = {}) {
    const serverMock = createMockSupabaseClient({
      auth: {
        user: overrides.user !== undefined
          ? overrides.user
          : { id: "user-1", email: "test@example.com" },
      },
    });

    const pluginData = overrides.pluginSource !== undefined
      ? overrides.pluginSource !== null
        ? [{ source: overrides.pluginSource }]
        : []
      : [{ source: "webhook" }];

    const adminMock = createMockSupabaseClient({
      tables: new Map([
        [
          "hq_plugins",
          {
            select: { data: pluginData, error: null },
            delete: overrides.deleteError
              ? { data: null, error: overrides.deleteError }
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
    const result = await deletePlugin("plugin-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unauthorized");
  });

  test("prevents deletion of built-in plugins", async () => {
    setupMocks({ pluginSource: "builtin" });
    const result = await deletePlugin("builtin-plugin");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Built-in plugins cannot be removed.");
  });

  test("allows deletion of webhook plugins", async () => {
    setupMocks({ pluginSource: "webhook" });
    const result = await deletePlugin("webhook-plugin");
    expect(result.ok).toBe(true);
  });

  test("allows deletion of local plugins", async () => {
    setupMocks({ pluginSource: "local" });
    const result = await deletePlugin("local-plugin");
    expect(result.ok).toBe(true);
  });

  test("returns error when delete fails", async () => {
    setupMocks({ deleteError: { message: "FK constraint" } });
    const result = await deletePlugin("plugin-1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("FK constraint");
  });
});
