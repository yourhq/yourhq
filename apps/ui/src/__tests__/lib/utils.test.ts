import { describe, test, expect } from "vitest";
import { slugify, cn } from "@/lib/utils";

describe("slugify", () => {
  test("converts spaces to underscores", () => {
    expect(slugify("hello world")).toBe("hello_world");
  });

  test("converts to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello_world");
  });

  test("removes special characters", () => {
    expect(slugify("hello@world!")).toBe("helloworld");
  });

  test("converts hyphens to underscores", () => {
    expect(slugify("hello-world")).toBe("hello_world");
  });

  test("collapses multiple spaces into a single underscore", () => {
    expect(slugify("hello   world")).toBe("hello_world");
  });

  test("strips emojis", () => {
    expect(slugify("hello 🚀 world")).toBe("hello_world");
  });

  test("strips underscores (non-alphanumeric)", () => {
    expect(slugify("valid_slug_123")).toBe("validslug123");
  });

  test("trims leading and trailing whitespace", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  test("truncates to 40 characters", () => {
    const long = "a".repeat(50);
    expect(slugify(long)).toHaveLength(40);
  });

  test("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  test("handles string of only special characters", () => {
    expect(slugify("!@#$%^&*()")).toBe("");
  });

  test("collapses consecutive hyphens into a single underscore", () => {
    expect(slugify("hello---world")).toBe("hello_world");
  });
});

describe("cn", () => {
  test("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  test("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  test("deduplicates conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  test("handles undefined and null inputs", () => {
    expect(cn("base", undefined, null, "end")).toBe("base end");
  });

  test("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });
});
