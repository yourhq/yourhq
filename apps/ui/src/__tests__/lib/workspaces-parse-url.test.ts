import { describe, test, expect } from "vitest";
import {
  parseSupabaseUrl,
  apiKeysDashboardUrl,
} from "@/lib/workspaces/parse-url";

describe("parseSupabaseUrl", () => {
  test("parses a cloud-hosted Supabase URL", () => {
    const result = parseSupabaseUrl("https://abcdefghijklmnop.supabase.co");
    expect(result).toEqual({
      ok: true,
      url: "https://abcdefghijklmnop.supabase.co",
      ref: "abcdefghijklmnop",
      isCloudHosted: true,
    });
  });

  test("strips trailing slash", () => {
    const result = parseSupabaseUrl("https://myproject.supabase.co/");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://myproject.supabase.co");
  });

  test("strips path and query params", () => {
    const result = parseSupabaseUrl(
      "https://myproject.supabase.co/rest/v1?apikey=xyz"
    );
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://myproject.supabase.co");
    expect(result.ref).toBe("myproject");
  });

  test("parses a self-hosted URL without extracting a ref", () => {
    const result = parseSupabaseUrl("https://db.mycompany.com");
    expect(result).toEqual({
      ok: true,
      url: "https://db.mycompany.com",
      ref: undefined,
      isCloudHosted: false,
    });
  });

  test("accepts http for self-hosted URLs", () => {
    const result = parseSupabaseUrl("http://localhost:54321");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("http://localhost:54321");
    expect(result.isCloudHosted).toBe(false);
  });

  test("returns error for empty input", () => {
    const result = parseSupabaseUrl("");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Database URL is empty.");
  });

  test("returns error for whitespace-only input", () => {
    const result = parseSupabaseUrl("   ");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Database URL is empty.");
  });

  test("returns error for non-URL input", () => {
    const result = parseSupabaseUrl("not-a-url");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("doesn't look like a URL");
  });

  test("returns error for ftp:// protocol", () => {
    const result = parseSupabaseUrl("ftp://files.supabase.co");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("https://");
  });

  test("treats bare supabase.co as non-cloud (hostname has no subdomain)", () => {
    const result = parseSupabaseUrl("https://supabase.co");
    expect(result.ok).toBe(true);
    expect(result.isCloudHosted).toBe(false);
    expect(result.ref).toBeUndefined();
  });

  test("extracts www as ref for www.supabase.co (matches subdomain pattern)", () => {
    const result = parseSupabaseUrl("https://www.supabase.co");
    expect(result.ok).toBe(true);
    expect(result.isCloudHosted).toBe(true);
    expect(result.ref).toBe("www");
  });

  test("trims leading/trailing whitespace before parsing", () => {
    const result = parseSupabaseUrl("  https://abc123.supabase.co  ");
    expect(result.ok).toBe(true);
    expect(result.ref).toBe("abc123");
  });

  test("handles cloud URL with port", () => {
    const result = parseSupabaseUrl("https://myref.supabase.co:8443");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://myref.supabase.co:8443");
    expect(result.ref).toBe("myref");
  });

  test("ref extraction is case-insensitive for domain suffix", () => {
    const result = parseSupabaseUrl("https://myproject.SUPABASE.CO");
    expect(result.ok).toBe(true);
    expect(result.isCloudHosted).toBe(true);
    expect(result.ref).toBe("myproject");
  });
});

describe("apiKeysDashboardUrl", () => {
  test("builds dashboard URL from a ref", () => {
    expect(apiKeysDashboardUrl("abcdef")).toBe(
      "https://supabase.com/dashboard/project/abcdef/settings/api-keys"
    );
  });

  test("returns null when ref is undefined", () => {
    expect(apiKeysDashboardUrl(undefined)).toBeNull();
  });

  test("returns null when ref is empty string", () => {
    expect(apiKeysDashboardUrl("")).toBeNull();
  });
});
