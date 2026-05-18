import { describe, test, expect } from "vitest";
import {
  deriveLightTokens,
  deriveDarkTokens,
  buildCssOverrides,
  parseOklch,
  formatOklch,
  oklchToHex,
  hexToOklch,
} from "@/lib/theme/derive";
import type { OklchColor, ThemeTokens } from "@/lib/theme/types";
import { DEFAULT_WARMTH } from "@/lib/theme/types";

const ALL_TOKEN_KEYS: (keyof ThemeTokens)[] = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "secondary",
  "secondary-foreground",
  "primary",
  "primary-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "sidebar-primary",
  "status-success",
  "status-warning",
  "status-error",
  "status-info",
  "status-progress",
  "status-neutral",
  "accent-blue",
  "accent-purple",
  "accent-emerald",
  "accent-cyan",
  "accent-violet",
  "accent-amber",
  "accent-teal",
  "accent-orange",
  "accent-pink",
  "accent-slate",
  "accent-indigo",
  "accent-sky",
];

describe("deriveLightTokens", () => {
  const brand: OklchColor = { l: 0.5, c: 0.09, h: 175 };
  const tokens = deriveLightTokens(brand, DEFAULT_WARMTH);

  test("returns all required ThemeTokens keys", () => {
    for (const key of ALL_TOKEN_KEYS) {
      expect(tokens).toHaveProperty(key);
      expect(typeof tokens[key]).toBe("string");
    }
  });

  test("primary token uses brand color directly", () => {
    expect(tokens.primary).toBe(`oklch(${brand.l} ${brand.c} ${brand.h})`);
  });

  test("background has high lightness (~0.98)", () => {
    const parsed = parseOklch(tokens.background);
    expect(parsed).not.toBeNull();
    expect(parsed!.l).toBeCloseTo(0.98, 2);
  });

  test("foreground has low lightness (~0.15)", () => {
    const parsed = parseOklch(tokens.foreground);
    expect(parsed).not.toBeNull();
    expect(parsed!.l).toBeCloseTo(0.15, 2);
  });

  test("warmth=0 produces neutral (achromatic) surfaces", () => {
    const neutral = deriveLightTokens(brand, 0);
    const bg = parseOklch(neutral.background);
    const muted = parseOklch(neutral.muted);
    const secondary = parseOklch(neutral.secondary);
    expect(bg!.c).toBe(0);
    expect(muted!.c).toBe(0);
    expect(secondary!.c).toBe(0);
  });

  test("higher warmth increases chroma in surface tokens", () => {
    const low = deriveLightTokens(brand, 0.002);
    const high = deriveLightTokens(brand, 0.01);
    const lowBg = parseOklch(low.background);
    const highBg = parseOklch(high.background);
    expect(highBg!.c).toBeGreaterThan(lowBg!.c);

    const lowMuted = parseOklch(low.muted);
    const highMuted = parseOklch(high.muted);
    expect(highMuted!.c).toBeGreaterThan(lowMuted!.c);
  });

  test("status tokens are independent of brand and warmth", () => {
    const altBrand: OklchColor = { l: 0.7, c: 0.2, h: 300 };
    const tokensAlt = deriveLightTokens(altBrand, 0.02);
    expect(tokensAlt["status-success"]).toBe(tokens["status-success"]);
    expect(tokensAlt["status-warning"]).toBe(tokens["status-warning"]);
    expect(tokensAlt["status-error"]).toBe(tokens["status-error"]);
    expect(tokensAlt["status-info"]).toBe(tokens["status-info"]);
    expect(tokensAlt["status-progress"]).toBe(tokens["status-progress"]);
  });
});

describe("deriveDarkTokens", () => {
  const brand: OklchColor = { l: 0.5, c: 0.09, h: 175 };
  const tokens = deriveDarkTokens(brand, DEFAULT_WARMTH);

  test("returns all required ThemeTokens keys", () => {
    for (const key of ALL_TOKEN_KEYS) {
      expect(tokens).toHaveProperty(key);
      expect(typeof tokens[key]).toBe("string");
    }
  });

  test("primary gets boosted lightness (brand.l + 0.22, capped at 0.85)", () => {
    const parsed = parseOklch(tokens.primary);
    expect(parsed).not.toBeNull();
    expect(parsed!.l).toBeCloseTo(Math.min(brand.l + 0.22, 0.85), 2);
    expect(parsed!.c).toBeCloseTo(brand.c * 0.94, 4);
    expect(parsed!.h).toBe(brand.h);
  });

  test("primary lightness is capped at 0.85 for bright brands", () => {
    const brightBrand: OklchColor = { l: 0.8, c: 0.1, h: 200 };
    const brightTokens = deriveDarkTokens(brightBrand, DEFAULT_WARMTH);
    const parsed = parseOklch(brightTokens.primary);
    expect(parsed!.l).toBe(0.85);
  });

  test("background has low lightness (~0.14)", () => {
    const parsed = parseOklch(tokens.background);
    expect(parsed).not.toBeNull();
    expect(parsed!.l).toBeCloseTo(0.14, 2);
  });

  test("foreground has high lightness (~0.93)", () => {
    const parsed = parseOklch(tokens.foreground);
    expect(parsed).not.toBeNull();
    expect(parsed!.l).toBeCloseTo(0.93, 2);
  });

  test("warmth=0 produces neutral dark surfaces", () => {
    const neutral = deriveDarkTokens(brand, 0);
    const bg = parseOklch(neutral.background);
    const card = parseOklch(neutral.card);
    const muted = parseOklch(neutral.muted);
    expect(bg!.c).toBe(0);
    expect(card!.c).toBe(0);
    expect(muted!.c).toBe(0);
  });

  test("dark status tokens have higher lightness than light mode counterparts", () => {
    const lightTokens = deriveLightTokens(brand, DEFAULT_WARMTH);
    const statusKeys = [
      "status-success",
      "status-warning",
      "status-error",
      "status-info",
      "status-progress",
    ] as const;
    for (const key of statusKeys) {
      const darkParsed = parseOklch(tokens[key]);
      const lightParsed = parseOklch(lightTokens[key]);
      expect(darkParsed!.l).toBeGreaterThan(lightParsed!.l);
    }
  });
});

describe("buildCssOverrides", () => {
  test("empty object returns empty string", () => {
    expect(buildCssOverrides({})).toBe("");
  });

  test("single token returns correct CSS variable", () => {
    const result = buildCssOverrides({ primary: "oklch(0.5 0.09 175)" });
    expect(result).toBe("--primary: oklch(0.5 0.09 175);");
  });

  test("multiple tokens joined with newline", () => {
    const result = buildCssOverrides({
      primary: "oklch(0.5 0.09 175)",
      background: "oklch(0.98 0.003 75)",
    });
    const lines = result.split("\n  ");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("--primary:");
    expect(lines[1]).toContain("--background:");
  });

  test("preserves oklch() values in output", () => {
    const result = buildCssOverrides({
      ring: "oklch(0.72 0.0846 175)",
    });
    expect(result).toContain("oklch(0.72 0.0846 175)");
  });
});

describe("parseOklch", () => {
  test("parses valid oklch string", () => {
    const result = parseOklch("oklch(0.5 0.09 175)");
    expect(result).toEqual({ l: 0.5, c: 0.09, h: 175 });
  });

  test("returns null for invalid string", () => {
    expect(parseOklch("rgb(255, 0, 0)")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseOklch("")).toBeNull();
  });

  test("handles decimal values correctly", () => {
    const result = parseOklch("oklch(0.987 0.0045 123.456)");
    expect(result).toEqual({ l: 0.987, c: 0.0045, h: 123.456 });
  });
});

describe("formatOklch", () => {
  test("formats OklchColor to oklch() string", () => {
    const color: OklchColor = { l: 0.5, c: 0.09, h: 175 };
    expect(formatOklch(color)).toBe("oklch(0.5 0.09 175)");
  });

  test("round-trips with parseOklch", () => {
    const original: OklchColor = { l: 0.72, c: 0.14, h: 250 };
    const formatted = formatOklch(original);
    const parsed = parseOklch(formatted);
    expect(parsed).toEqual(original);
  });
});

describe("oklchToHex / hexToOklch", () => {
  test("round-trip: hex -> oklch -> hex produces same result", () => {
    const hexColors = ["#3388cc", "#aa5522", "#66bb77"];
    for (const hex of hexColors) {
      const oklch = hexToOklch(hex);
      const backToHex = oklchToHex(oklch);
      const r1 = parseInt(hex.slice(1, 3), 16);
      const g1 = parseInt(hex.slice(3, 5), 16);
      const b1 = parseInt(hex.slice(5, 7), 16);
      const r2 = parseInt(backToHex.slice(1, 3), 16);
      const g2 = parseInt(backToHex.slice(3, 5), 16);
      const b2 = parseInt(backToHex.slice(5, 7), 16);
      expect(Math.abs(r1 - r2)).toBeLessThanOrEqual(2);
      expect(Math.abs(g1 - g2)).toBeLessThanOrEqual(2);
      expect(Math.abs(b1 - b2)).toBeLessThanOrEqual(2);
    }
  });

  test("pure white (#ffffff) converts to approximately l=1, c=0", () => {
    const white = hexToOklch("#ffffff");
    expect(white.l).toBeCloseTo(1, 1);
    expect(white.c).toBeCloseTo(0, 2);
  });

  test("pure black (#000000) converts to l=0, c=0", () => {
    const black = hexToOklch("#000000");
    expect(black.l).toBe(0);
    expect(black.c).toBe(0);
  });
});
