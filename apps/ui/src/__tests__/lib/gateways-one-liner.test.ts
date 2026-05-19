import { describe, test, expect } from "vitest";
import {
  buildGatewayOneLiner,
  type BuildOneLinerInput,
} from "@/lib/gateways/one-liner";

const baseInput: BuildOneLinerInput = {
  token: "tok_abc123",
  label: "my-gateway",
  project: {
    url: "https://abcdef.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiJ9.anon",
    serviceRoleKey: "eyJhbGciOiJIUzI1NiJ9.service",
  },
};

describe("buildGatewayOneLiner", () => {
  test("includes all required env vars", () => {
    const result = buildGatewayOneLiner(baseInput);
    expect(result).toContain("GATEWAY_TOKEN=");
    expect(result).toContain("SUPABASE_URL=");
    expect(result).toContain("SUPABASE_ANON_KEY=");
    expect(result).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(result).toContain("GATEWAY_LABEL=");
  });

  test("includes the curl command targeting install.yourhq.ai/gateway", () => {
    const result = buildGatewayOneLiner(baseInput);
    expect(result).toContain("curl -fsSL https://install.yourhq.ai/gateway");
  });

  test("ends with bash", () => {
    const result = buildGatewayOneLiner(baseInput);
    expect(result.trimEnd().endsWith("bash")).toBe(true);
  });

  test("shell-quotes values with single quotes", () => {
    const result = buildGatewayOneLiner(baseInput);
    expect(result).toContain("'tok_abc123'");
    expect(result).toContain("'my-gateway'");
  });

  test("escapes single quotes in values", () => {
    const input: BuildOneLinerInput = {
      ...baseInput,
      label: "gate'way",
    };
    const result = buildGatewayOneLiner(input);
    expect(result).toContain("'gate'\\''way'");
  });

  test("does not include TAILSCALE_AUTH_KEY when not provided", () => {
    const result = buildGatewayOneLiner(baseInput);
    expect(result).not.toContain("TAILSCALE_AUTH_KEY");
  });

  test("includes TAILSCALE_AUTH_KEY when provided", () => {
    const input: BuildOneLinerInput = {
      ...baseInput,
      tailscaleAuthKey: "tskey-auth-abc123",
    };
    const result = buildGatewayOneLiner(input);
    expect(result).toContain("TAILSCALE_AUTH_KEY='tskey-auth-abc123'");
  });

  test("trims whitespace from tailscaleAuthKey", () => {
    const input: BuildOneLinerInput = {
      ...baseInput,
      tailscaleAuthKey: "  tskey-auth-xyz  ",
    };
    const result = buildGatewayOneLiner(input);
    expect(result).toContain("TAILSCALE_AUTH_KEY='tskey-auth-xyz'");
  });

  test("omits TAILSCALE_AUTH_KEY when it is whitespace-only", () => {
    const input: BuildOneLinerInput = {
      ...baseInput,
      tailscaleAuthKey: "   ",
    };
    const result = buildGatewayOneLiner(input);
    expect(result).not.toContain("TAILSCALE_AUTH_KEY");
  });

  test("handles special shell characters in project URL", () => {
    const input: BuildOneLinerInput = {
      ...baseInput,
      project: {
        ...baseInput.project,
        url: "https://example.com/$foo&bar",
      },
    };
    const result = buildGatewayOneLiner(input);
    expect(result).toContain("'https://example.com/$foo&bar'");
  });
});
