import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type posthogType from "posthog-js";

vi.mock("posthog-js", () => ({
  default: {
    capture: vi.fn(),
    identify: vi.fn(),
    group: vi.fn(),
    reset: vi.fn(),
  },
}));

describe("analytics (enabled)", () => {
  let trackEvent: typeof import("@/lib/analytics/index").trackEvent;
  let identifyUser: typeof import("@/lib/analytics/index").identifyUser;
  let setWorkspaceGroup: typeof import("@/lib/analytics/index").setWorkspaceGroup;
  let resetAnalytics: typeof import("@/lib/analytics/index").resetAnalytics;
  let posthog: typeof posthogType;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "test-token";
    vi.resetModules();
    const mod = await import("@/lib/analytics/index");
    trackEvent = mod.trackEvent;
    identifyUser = mod.identifyUser;
    setWorkspaceGroup = mod.setWorkspaceGroup;
    resetAnalytics = mod.resetAnalytics;
    const phMod = await import("posthog-js");
    posthog = phMod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trackEvent calls posthog.capture", () => {
    trackEvent("page_view");
    expect(posthog.capture).toHaveBeenCalledWith("page_view", undefined);
  });

  it("trackEvent passes properties to capture", () => {
    const props = { page: "/dashboard", source: "nav" };
    trackEvent("page_view", props);
    expect(posthog.capture).toHaveBeenCalledWith("page_view", props);
  });

  it("trackEvent with no properties works", () => {
    trackEvent("button_click");
    expect(posthog.capture).toHaveBeenCalledWith("button_click", undefined);
  });

  it("identifyUser calls posthog.identify", () => {
    identifyUser("user-123");
    expect(posthog.identify).toHaveBeenCalledWith("user-123", undefined);
  });

  it("identifyUser passes properties to identify", () => {
    const props = { email: "test@example.com", plan: "pro" };
    identifyUser("user-123", props);
    expect(posthog.identify).toHaveBeenCalledWith("user-123", props);
  });

  it("identifyUser with no properties works", () => {
    identifyUser("user-456");
    expect(posthog.identify).toHaveBeenCalledWith("user-456", undefined);
  });

  it("setWorkspaceGroup calls posthog.group with 'workspace' prefix", () => {
    setWorkspaceGroup("ws-abc");
    expect(posthog.group).toHaveBeenCalledWith("workspace", "ws-abc", undefined);
  });

  it("setWorkspaceGroup passes properties", () => {
    const props = { name: "Acme Corp", tier: "enterprise" };
    setWorkspaceGroup("ws-abc", props);
    expect(posthog.group).toHaveBeenCalledWith("workspace", "ws-abc", props);
  });

  it("resetAnalytics calls posthog.reset", () => {
    resetAnalytics();
    expect(posthog.reset).toHaveBeenCalled();
  });
});

describe("analytics (disabled — no token)", () => {
  let trackEvent: typeof import("@/lib/analytics/index").trackEvent;
  let identifyUser: typeof import("@/lib/analytics/index").identifyUser;
  let setWorkspaceGroup: typeof import("@/lib/analytics/index").setWorkspaceGroup;
  let resetAnalytics: typeof import("@/lib/analytics/index").resetAnalytics;
  let posthog: typeof posthogType;

  beforeAll(async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    vi.resetModules();
    const mod = await import("@/lib/analytics/index");
    trackEvent = mod.trackEvent;
    identifyUser = mod.identifyUser;
    setWorkspaceGroup = mod.setWorkspaceGroup;
    resetAnalytics = mod.resetAnalytics;
    const phMod = await import("posthog-js");
    posthog = phMod.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("all functions are no-ops when token is not set", () => {
    trackEvent("page_view", { page: "/" });
    identifyUser("user-123", { email: "test@example.com" });
    setWorkspaceGroup("ws-abc", { name: "Test" });
    resetAnalytics();

    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.group).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });
});
