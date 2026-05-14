import { describe, test, expect } from "vitest";
import { deriveKeyFromName } from "@/lib/secrets/utils";

describe("deriveKeyFromName", () => {
  test("converts to uppercase", () => {
    expect(deriveKeyFromName("api_key")).toBe("API_KEY");
  });

  test("replaces spaces with underscores", () => {
    expect(deriveKeyFromName("my secret key")).toBe("MY_SECRET_KEY");
  });

  test("replaces non-alphanumeric characters with underscores", () => {
    expect(deriveKeyFromName("api-key.v2")).toBe("API_KEY_V2");
  });

  test("strips leading and trailing underscores", () => {
    expect(deriveKeyFromName("--api_key--")).toBe("API_KEY");
  });

  test("collapses consecutive underscores", () => {
    expect(deriveKeyFromName("api___key")).toBe("API_KEY");
  });

  test("handles already-valid env var names", () => {
    expect(deriveKeyFromName("DATABASE_URL")).toBe("DATABASE_URL");
  });

  test("handles mixed special characters", () => {
    expect(deriveKeyFromName("My App's API-Key (v2)")).toBe(
      "MY_APP_S_API_KEY_V2"
    );
  });

  test("handles empty string", () => {
    expect(deriveKeyFromName("")).toBe("");
  });

  test("handles string of only special characters", () => {
    expect(deriveKeyFromName("---")).toBe("");
  });

  test("preserves numbers", () => {
    expect(deriveKeyFromName("key123value")).toBe("KEY123VALUE");
  });
});
