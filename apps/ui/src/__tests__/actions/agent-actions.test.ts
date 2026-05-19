import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import {
  getServerClient,
  resetServerMocks,
} from "@/__tests__/helpers/server-mock";

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/supabase/admin");

vi.mock("@/generated/templates", () => ({
  BUNDLED_TEMPLATES: [
    {
      branch: "template/analytics",
      name: "Analytics",
      description: "Analytics template",
      emoji: "📊",
      team: "analytics",
      domains: ["analytics"],
      capabilities: ["reporting"],
    },
    {
      branch: "template/assistant",
      name: "Assistant",
      description: "Assistant template",
      emoji: "🧑‍💼",
      team: "ops",
      domains: [],
      capabilities: [],
    },
  ],
}));

import {
  createAgentWithBranch,
  updateAgent,
  enqueueAgentCommand,
} from "@/app/dashboard/agents/actions";

beforeEach(() => {
  resetServerMocks();
});

describe("createAgentWithBranch", () => {
  function setupMocks(overrides: {
    user?: { id: string; email: string } | null;
    workspace?: Record<string, unknown> | null;
    existingAgent?: Record<string, unknown> | null;
    gateway?: Record<string, unknown> | null;
    insertedAgent?: Record<string, unknown> | null;
    insertError?: { message: string; code?: string } | null;
  } = {}) {
    const mock = createMockSupabaseClient({
      auth: {
        user: overrides.user !== undefined
          ? overrides.user
          : { id: "user-1", email: "test@example.com" },
      },
      tables: new Map([
        [
          "workspace",
          {
            select: {
              data: overrides.workspace !== undefined
                ? overrides.workspace ? [overrides.workspace] : []
                : [{ slug: "acme", owner_name: "Test User", owner_preferred_name: "Test", owner_timezone: "America/New_York" }],
              error: null,
            },
          },
        ],
        [
          "agents",
          {
            select: {
              data: overrides.existingAgent !== undefined
                ? overrides.existingAgent ? [overrides.existingAgent] : []
                : [],
              error: null,
            },
            insert: overrides.insertError
              ? { data: null, error: overrides.insertError }
              : {
                  data: overrides.insertedAgent !== undefined
                    ? overrides.insertedAgent ? [overrides.insertedAgent] : []
                    : [{ id: "new-agent-id" }],
                  error: null,
                },
          },
        ],
        [
          "gateways",
          {
            select: {
              data: overrides.gateway !== undefined
                ? overrides.gateway ? [overrides.gateway] : []
                : [{ id: "gw-1" }],
              error: null,
            },
          },
        ],
        [
          "audit_log",
          {
            insert: { data: [], error: null },
          },
        ],
      ]),
    });

    const client = getServerClient();
    Object.assign(client, mock);
    return mock;
  }

  describe("slug validation", () => {
    test("rejects empty slug", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug is required");
    });

    test("rejects slug shorter than 2 characters", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "a",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug must be 2–40 characters");
    });

    test("rejects slug longer than 40 characters", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "a".repeat(41),
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug must be 2–40 characters");
    });

    test("rejects slug with special characters", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "my_agent",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug must be lowercase");
    });

    test("rejects slug with spaces", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "my agent",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug must be lowercase");
    });

    test("rejects slug starting with hyphen", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "-agent",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug must be lowercase");
    });

    test("rejects slug ending with hyphen", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "agent-",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug must be lowercase");
    });

    test("rejects reserved slug 'default'", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "default",
          templateBranch: null,
        }),
      ).rejects.toThrow('Slug "default" is reserved');
    });

    test("rejects reserved slug 'main'", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "main",
          templateBranch: null,
        }),
      ).rejects.toThrow('Slug "main" is reserved');
    });

    test("rejects reserved slug 'master'", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "master",
          templateBranch: null,
        }),
      ).rejects.toThrow('Slug "master" is reserved');
    });

    test("rejects reserved slug 'template'", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "template",
          templateBranch: null,
        }),
      ).rejects.toThrow('Slug "template" is reserved');
    });

    test("rejects slug starting with 'template/'", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "template/foo",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug must be lowercase");
    });

    test("rejects slug starting with 'template-'", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "template-foo",
          templateBranch: null,
        }),
      ).rejects.toThrow("Slug cannot start with template");
    });

    test("accepts valid slug with hyphens", async () => {
      setupMocks();
      const result = await createAgentWithBranch({
        name: "Test Agent",
        slug: "my-test-agent",
        templateBranch: null,
      });
      expect(result.slug).toBe("my-test-agent");
    });

    test("accepts valid two-character slug", async () => {
      setupMocks();
      const result = await createAgentWithBranch({
        name: "Test",
        slug: "ab",
        templateBranch: null,
      });
      expect(result.slug).toBe("ab");
    });
  });

  describe("branch name construction", () => {
    test("prefixes branch with workspace slug when available", async () => {
      setupMocks();
      const result = await createAgentWithBranch({
        name: "Bot",
        slug: "my-bot",
        templateBranch: null,
      });
      expect(result.branch).toBe("acme/my-bot");
    });

    test("uses plain slug as branch when no workspace slug", async () => {
      setupMocks({ workspace: null });
      const result = await createAgentWithBranch({
        name: "Bot",
        slug: "my-bot",
        templateBranch: null,
      });
      expect(result.branch).toBe("my-bot");
    });
  });

  describe("template resolution", () => {
    test("resolves template metadata for known template branch", async () => {
      setupMocks();
      const result = await createAgentWithBranch({
        name: "My Analytics",
        slug: "analytics-bot",
        templateBranch: "template/analytics",
      });
      expect(result.sourceBranch).toBe("template/analytics");
    });

    test("uses 'default' as source branch when templateBranch is null", async () => {
      setupMocks();
      const result = await createAgentWithBranch({
        name: "Custom",
        slug: "custom-bot",
        templateBranch: null,
      });
      expect(result.sourceBranch).toBe("default");
    });
  });

  describe("authentication and duplicate checks", () => {
    test("throws Unauthorized when no user session", async () => {
      setupMocks({ user: null });
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "test-bot",
          templateBranch: null,
        }),
      ).rejects.toThrow("Unauthorized");
    });

    test("throws when agent with same slug already exists", async () => {
      setupMocks({ existingAgent: { id: "existing-id" } });
      await expect(
        createAgentWithBranch({
          name: "Test",
          slug: "test-bot",
          templateBranch: null,
        }),
      ).rejects.toThrow('Agent with slug "test-bot" already exists');
    });

    test("rejects empty name", async () => {
      setupMocks();
      await expect(
        createAgentWithBranch({
          name: "   ",
          slug: "valid-slug",
          templateBranch: null,
        }),
      ).rejects.toThrow("Name is required");
    });
  });

  describe("gateway fallback", () => {
    test("uses provided gatewayId when given", async () => {
      setupMocks();
      const result = await createAgentWithBranch({
        name: "Bot",
        slug: "my-bot",
        templateBranch: null,
        gatewayId: "custom-gw",
      });
      expect(result.gatewayId).toBe("custom-gw");
    });
  });

  describe("result shape", () => {
    test("returns agentId, slug, branch, sourceBranch, and owner info", async () => {
      setupMocks();
      const result = await createAgentWithBranch({
        name: "Bot",
        slug: "my-bot",
        templateBranch: "template/assistant",
      });
      expect(result).toMatchObject({
        agentId: "new-agent-id",
        slug: "my-bot",
        branch: "acme/my-bot",
        sourceBranch: "template/assistant",
        ownerName: "Test User",
        ownerPreferredName: "Test",
        ownerTimezone: "America/New_York",
      });
    });
  });
});

describe("updateAgent", () => {
  function setupMocks(overrides: {
    agent?: Record<string, unknown> | null;
    reportsChain?: Record<string, unknown>[];
    updateError?: { message: string } | null;
  } = {}) {
    const agentData = overrides.agent !== undefined
      ? overrides.agent
        ? [overrides.agent]
        : []
      : [{ id: "agent-1", slug: "bot-1", name: "Bot One" }];

    const mock = createMockSupabaseClient({
      auth: { user: { id: "user-1", email: "test@example.com" } },
      tables: new Map([
        [
          "agents",
          {
            select: { data: agentData, error: null },
            update: overrides.updateError
              ? { data: null, error: overrides.updateError }
              : { data: [], error: null },
          },
        ],
        [
          "audit_log",
          {
            insert: { data: [], error: null },
          },
        ],
      ]),
      rpcs: new Map([
        [
          "agent_reports_chain",
          {
            data: overrides.reportsChain ?? [],
            error: null,
          },
        ],
      ]),
    });

    const client = getServerClient();
    Object.assign(client, mock);
    return mock;
  }

  test("throws Unauthorized when no user session", async () => {
    const mock = createMockSupabaseClient({
      auth: { user: null },
    });
    const client = getServerClient();
    Object.assign(client, mock);

    await expect(
      updateAgent({ agentId: "agent-1", name: "New Name" }),
    ).rejects.toThrow("Unauthorized");
  });

  test("throws when agent not found", async () => {
    setupMocks({ agent: null });
    await expect(
      updateAgent({ agentId: "missing", name: "New Name" }),
    ).rejects.toThrow("Agent not found");
  });

  test("throws when name is empty after trimming", async () => {
    setupMocks();
    await expect(
      updateAgent({ agentId: "agent-1", name: "   " }),
    ).rejects.toThrow("Name is required");
  });

  test("throws when agent tries to report to itself", async () => {
    setupMocks();
    await expect(
      updateAgent({ agentId: "agent-1", reportsToId: "agent-1" }),
    ).rejects.toThrow("An agent cannot report to itself");
  });

  test("throws when reportsToId would create a circular chain", async () => {
    setupMocks({
      reportsChain: [{ agent_id: "agent-1" }],
    });
    await expect(
      updateAgent({ agentId: "agent-1", reportsToId: "agent-2" }),
    ).rejects.toThrow("This would create a circular reporting chain");
  });

  test("returns without error when no fields to update", async () => {
    setupMocks();
    await expect(updateAgent({ agentId: "agent-1" })).resolves.toBeUndefined();
  });

  test("throws when Supabase update fails", async () => {
    setupMocks({ updateError: { message: "DB constraint violation" } });
    await expect(
      updateAgent({ agentId: "agent-1", name: "New Name" }),
    ).rejects.toThrow("DB constraint violation");
  });
});

describe("enqueueAgentCommand", () => {
  function setupMocks(overrides: {
    user?: { id: string; email: string } | null;
    agent?: Record<string, unknown> | null;
    gateway?: Record<string, unknown> | null;
    insertedCommand?: Record<string, unknown> | null;
    insertError?: { message: string } | null;
  } = {}) {
    const mock = createMockSupabaseClient({
      auth: {
        user: overrides.user !== undefined
          ? overrides.user
          : { id: "user-1", email: "test@example.com" },
      },
      tables: new Map([
        [
          "agents",
          {
            select: {
              data: overrides.agent !== undefined
                ? overrides.agent
                  ? [overrides.agent]
                  : []
                : [{ id: "agent-1", slug: "bot-1", gateway_id: "gw-1" }],
              error: null,
            },
          },
        ],
        [
          "gateways",
          {
            select: {
              data: overrides.gateway !== undefined
                ? overrides.gateway
                  ? [overrides.gateway]
                  : []
                : [{ id: "gw-1" }],
              error: null,
            },
          },
        ],
        [
          "agent_commands",
          {
            insert: overrides.insertError
              ? { data: null, error: overrides.insertError }
              : {
                  data: overrides.insertedCommand !== undefined
                    ? overrides.insertedCommand
                      ? [overrides.insertedCommand]
                      : []
                    : [{ id: "cmd-1" }],
                  error: null,
                },
          },
        ],
        [
          "audit_log",
          {
            insert: { data: [], error: null },
          },
        ],
      ]),
    });

    const client = getServerClient();
    Object.assign(client, mock);
    return mock;
  }

  test("throws Unauthorized when no user session", async () => {
    setupMocks({ user: null });
    await expect(
      enqueueAgentCommand({ action: "provision", agentId: "agent-1" }),
    ).rejects.toThrow("Unauthorized");
  });

  test("throws for unknown command action", async () => {
    setupMocks();
    await expect(
      enqueueAgentCommand({ action: "nonexistent" as never }),
    ).rejects.toThrow("Unknown command action: nonexistent");
  });

  test("throws when agent-scoped action is missing agentId", async () => {
    setupMocks();
    await expect(
      enqueueAgentCommand({ action: "provision" }),
    ).rejects.toThrow("Agent ID is required for this command");
  });

  test("throws when agent not found for agent-scoped command", async () => {
    setupMocks({ agent: null });
    await expect(
      enqueueAgentCommand({ action: "provision", agentId: "missing" }),
    ).rejects.toThrow("Agent not found");
  });

  test("returns commandId on success for agent-scoped command", async () => {
    setupMocks();
    const result = await enqueueAgentCommand({
      action: "provision",
      agentId: "agent-1",
    });
    expect(result.commandId).toBe("cmd-1");
  });

  test("returns commandId on success for system command", async () => {
    setupMocks();
    const result = await enqueueAgentCommand({
      action: "restart_gateway",
      gatewayId: "gw-1",
    });
    expect(result.commandId).toBe("cmd-1");
  });

  test("throws when command insert fails", async () => {
    setupMocks({ insertError: { message: "Insert failed" } });
    await expect(
      enqueueAgentCommand({
        action: "restart_gateway",
        gatewayId: "gw-1",
      }),
    ).rejects.toThrow("Insert failed");
  });
});
