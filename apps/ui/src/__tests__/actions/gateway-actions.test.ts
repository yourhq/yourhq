import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/__tests__/helpers/supabase-mock";
import {
  getAdminClient,
  resetServerMocks,
} from "@/__tests__/helpers/server-mock";

vi.mock("@/lib/supabase/server");
vi.mock("@/lib/supabase/admin");

vi.mock("@/lib/gateways/mint-token", () => ({
  mintGatewayToken: vi.fn(),
  checkTokenConsumed: vi.fn(),
}));
vi.mock("@/lib/gateways/one-liner", () => ({
  buildGatewayOneLiner: vi.fn(),
}));
vi.mock("@/lib/workspaces", () => ({
  getActiveWorkspaceWithSecrets: vi.fn(),
}));

import {
  getGatewayDesktopUrlAction,
  updateReachableUrlOverrideAction,
  updateGatewayLabelAction,
} from "@/app/dashboard/settings/gateways/actions";

beforeEach(() => {
  resetServerMocks();
});

describe("getGatewayDesktopUrlAction", () => {
  function setupMocks(overrides: {
    gateway?: { label: string; meta: Record<string, unknown> } | null;
    error?: { message: string } | null;
  } = {}) {
    const gatewayData = overrides.gateway !== undefined
      ? overrides.gateway
        ? [overrides.gateway]
        : []
      : [{ label: "Default Gateway", meta: {} }];

    const mock = createMockSupabaseClient({
      tables: new Map([
        [
          "gateways",
          {
            select: overrides.error
              ? { data: null, error: overrides.error }
              : { data: gatewayData, error: null },
          },
        ],
      ]),
    });

    const client = getAdminClient();
    Object.assign(client, mock);
    return mock;
  }

  test("returns error when gateway not found", async () => {
    setupMocks({ gateway: null });
    const result = await getGatewayDesktopUrlAction("missing-gw");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Gateway not found.");
  });

  test("returns error when gateway row has Supabase error", async () => {
    const mock = createMockSupabaseClient({
      tables: new Map([
        [
          "gateways",
          {
            select: { data: null, error: { message: "DB error" } },
          },
        ],
      ]),
    });
    const client = getAdminClient();
    Object.assign(client, mock);

    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(false);
  });

  test("returns null novncUrl when no reachable_urls in meta", async () => {
    setupMocks({ gateway: { label: "GW", meta: {} } });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toBeNull();
    expect(result.data?.gatewayLabel).toBe("GW");
  });

  test("applies override base URL protocol and hostname to novnc URL", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "http://192.168.1.10:6901/vnc.html" },
          reachable_urls_override: { base: "https://mygateway.example.com" },
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toContain("https://mygateway.example.com");
    expect(result.data?.novncUrl).toContain("/vnc.html");
  });

  test("applies override base URL port", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "http://192.168.1.10:6901/vnc.html" },
          reachable_urls_override: { base: "https://mygateway.example.com:8443" },
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toContain(":8443");
  });

  test("falls through to auto URL when override is not a valid URL", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "http://192.168.1.10:6901/vnc.html" },
          reachable_urls_override: { base: "not-a-url" },
          networking_mode: "tailscale",
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toContain("192.168.1.10");
  });

  test("routes through local proxy for local networking mode without override", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "http://localhost:6901/vnc.html" },
          networking_mode: "local",
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toBe(
      "/desktop/vnc.html?autoconnect=1&resize=remote&path=desktop/websockify",
    );
  });

  test("appends VNC password to local proxy URL", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "http://localhost:6901/vnc.html" },
          networking_mode: "local",
          vnc_password: "secret123",
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toContain("&password=secret123");
  });

  test("appends VNC password to remote URL when not local mode", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "https://gw.tailnet.ts.net:6901/vnc.html" },
          reachable_urls_override: { base: "https://gw.tailnet.ts.net:6901" },
          networking_mode: "tailscale",
          vnc_password: "abc",
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toContain("password=abc");
  });

  test("uses ? separator when novnc URL has no existing query params", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "https://gw.example.com/vnc.html" },
          reachable_urls_override: { base: "https://gw.example.com" },
          networking_mode: "tailscale",
          vnc_password: "pw",
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toContain("?password=pw");
  });

  test("uses & separator when novnc URL already has query params", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "https://gw.example.com/vnc.html?autoconnect=1" },
          reachable_urls_override: { base: "https://gw.example.com" },
          networking_mode: "tailscale",
          vnc_password: "pw",
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl).toContain("&password=pw");
  });

  test("defaults to local networking mode when not set", async () => {
    setupMocks({
      gateway: {
        label: "GW",
        meta: {
          reachable_urls: { novnc: "http://localhost:6901/vnc.html" },
        },
      },
    });
    const result = await getGatewayDesktopUrlAction("gw-1");
    expect(result.ok).toBe(true);
    expect(result.data?.novncUrl?.startsWith("/desktop/")).toBe(true);
  });
});

describe("updateReachableUrlOverrideAction", () => {
  function setupMocks(overrides: {
    gateway?: { meta: Record<string, unknown> } | null;
    getError?: { message: string } | null;
    updateError?: { message: string } | null;
  } = {}) {
    const gatewayData = overrides.gateway !== undefined
      ? overrides.gateway
        ? [overrides.gateway]
        : []
      : [{ meta: {} }];

    const mock = createMockSupabaseClient({
      tables: new Map([
        [
          "gateways",
          {
            select: overrides.getError
              ? { data: null, error: overrides.getError }
              : { data: gatewayData, error: null },
            update: overrides.updateError
              ? { data: null, error: overrides.updateError }
              : { data: [], error: null },
          },
        ],
      ]),
    });

    const client = getAdminClient();
    Object.assign(client, mock);
    return mock;
  }

  test("returns error when gateway not found", async () => {
    setupMocks({ gateway: null });
    const result = await updateReachableUrlOverrideAction("missing", "https://example.com");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Gateway not found");
  });

  test("returns error for invalid URL", async () => {
    setupMocks();
    const result = await updateReachableUrlOverrideAction("gw-1", "not-a-url");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Not a valid URL.");
  });

  test("accepts valid HTTPS URL", async () => {
    setupMocks();
    const result = await updateReachableUrlOverrideAction("gw-1", "https://gw.example.com");
    expect(result.ok).toBe(true);
  });

  test("accepts null to clear override", async () => {
    setupMocks({ gateway: { meta: { reachable_urls_override: { base: "https://old.example.com" } } } });
    const result = await updateReachableUrlOverrideAction("gw-1", null);
    expect(result.ok).toBe(true);
  });

  test("treats empty string as null (clear)", async () => {
    setupMocks();
    const result = await updateReachableUrlOverrideAction("gw-1", "   ");
    expect(result.ok).toBe(true);
  });

  test("returns error when fetch fails", async () => {
    setupMocks({ getError: { message: "Connection error" } });
    const result = await updateReachableUrlOverrideAction("gw-1", "https://x.com");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Connection error");
  });

  test("returns error when update fails", async () => {
    setupMocks({ updateError: { message: "Write failed" } });
    const result = await updateReachableUrlOverrideAction("gw-1", "https://example.com");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Write failed");
  });
});

describe("updateGatewayLabelAction", () => {
  function setupMocks(overrides: {
    updateError?: { message: string } | null;
  } = {}) {
    const mock = createMockSupabaseClient({
      tables: new Map([
        [
          "gateways",
          {
            update: overrides.updateError
              ? { data: null, error: overrides.updateError }
              : { data: [], error: null },
          },
        ],
      ]),
    });

    const client = getAdminClient();
    Object.assign(client, mock);
    return mock;
  }

  test("rejects empty label", async () => {
    const result = await updateGatewayLabelAction("gw-1", "");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Label is required.");
  });

  test("rejects whitespace-only label", async () => {
    const result = await updateGatewayLabelAction("gw-1", "   ");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Label is required.");
  });

  test("rejects label longer than 80 characters", async () => {
    const result = await updateGatewayLabelAction("gw-1", "a".repeat(81));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Label is too long.");
  });

  test("accepts exactly 80 character label", async () => {
    setupMocks();
    const result = await updateGatewayLabelAction("gw-1", "a".repeat(80));
    expect(result.ok).toBe(true);
  });

  test("trims label before saving", async () => {
    setupMocks();
    const result = await updateGatewayLabelAction("gw-1", "  My Gateway  ");
    expect(result.ok).toBe(true);
  });

  test("returns error when Supabase update fails", async () => {
    setupMocks({ updateError: { message: "Update failed" } });
    const result = await updateGatewayLabelAction("gw-1", "New Label");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Update failed");
  });

  test("succeeds with valid label", async () => {
    setupMocks();
    const result = await updateGatewayLabelAction("gw-1", "Production Gateway");
    expect(result.ok).toBe(true);
  });
});
