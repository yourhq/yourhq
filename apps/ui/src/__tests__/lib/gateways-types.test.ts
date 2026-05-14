import { describe, test, expect, vi, afterEach } from "vitest";
import {
  isHeartbeatFresh,
  resolveBaseUrl,
  HEARTBEAT_FRESH_SECONDS,
  type GatewayMeta,
} from "@/lib/gateways/types";

describe("isHeartbeatFresh", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns true when last_seen_at is within the threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    const recent = new Date(
      Date.now() - (HEARTBEAT_FRESH_SECONDS - 10) * 1000
    ).toISOString();
    expect(isHeartbeatFresh(recent)).toBe(true);
  });

  test("returns false when last_seen_at is older than the threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    const stale = new Date(
      Date.now() - (HEARTBEAT_FRESH_SECONDS + 10) * 1000
    ).toISOString();
    expect(isHeartbeatFresh(stale)).toBe(false);
  });

  test("returns false when last_seen_at is null", () => {
    expect(isHeartbeatFresh(null)).toBe(false);
  });

  test("returns false when last_seen_at is exactly at the boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
    const boundary = new Date(
      Date.now() - HEARTBEAT_FRESH_SECONDS * 1000
    ).toISOString();
    expect(isHeartbeatFresh(boundary)).toBe(false);
  });

  test("returns true for a just-now timestamp", () => {
    const now = new Date().toISOString();
    expect(isHeartbeatFresh(now)).toBe(true);
  });
});

describe("resolveBaseUrl", () => {
  test("returns override URL when both override and auto-detected exist", () => {
    const meta: GatewayMeta = {
      reachable_urls_override: { base: "https://custom-proxy.example.com" },
      reachable_urls: { base: "https://auto-detected.example.com" },
    };
    expect(resolveBaseUrl(meta)).toBe("https://custom-proxy.example.com");
  });

  test("falls back to auto-detected URL when no override", () => {
    const meta: GatewayMeta = {
      reachable_urls: { base: "https://auto-detected.example.com" },
    };
    expect(resolveBaseUrl(meta)).toBe("https://auto-detected.example.com");
  });

  test("returns null when neither override nor auto-detected URL exists", () => {
    const meta: GatewayMeta = {};
    expect(resolveBaseUrl(meta)).toBeNull();
  });

  test("returns null when reachable_urls exists but has no base", () => {
    const meta: GatewayMeta = {
      reachable_urls: { novnc: "https://novnc.example.com" },
    };
    expect(resolveBaseUrl(meta)).toBeNull();
  });

  test("returns override even when auto-detected base is undefined", () => {
    const meta: GatewayMeta = {
      reachable_urls_override: { base: "https://override.example.com" },
      reachable_urls: {},
    };
    expect(resolveBaseUrl(meta)).toBe("https://override.example.com");
  });
});
