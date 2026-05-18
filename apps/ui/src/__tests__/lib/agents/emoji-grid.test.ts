import { describe, it, expect } from "vitest";
import { AGENT_EMOJIS, AGENT_EMOJI_LABELS } from "@/lib/agents/emoji-grid";

describe("AGENT_EMOJIS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(AGENT_EMOJIS)).toBe(true);
    expect(AGENT_EMOJIS.length).toBeGreaterThan(0);
  });

  it("has 48 entries", () => {
    expect(AGENT_EMOJIS).toHaveLength(48);
  });

  it("every entry is a string", () => {
    for (const emoji of AGENT_EMOJIS) {
      expect(typeof emoji).toBe("string");
    }
  });

  it("contains no duplicate emojis", () => {
    const unique = new Set(AGENT_EMOJIS);
    expect(unique.size).toBe(AGENT_EMOJIS.length);
  });
});

describe("AGENT_EMOJI_LABELS", () => {
  it("is a non-empty object", () => {
    expect(typeof AGENT_EMOJI_LABELS).toBe("object");
    expect(Object.keys(AGENT_EMOJI_LABELS).length).toBeGreaterThan(0);
  });

  it("every emoji in AGENT_EMOJIS has a label", () => {
    for (const emoji of AGENT_EMOJIS) {
      expect(AGENT_EMOJI_LABELS).toHaveProperty(emoji);
    }
  });

  it("every label is a non-empty string", () => {
    for (const label of Object.values(AGENT_EMOJI_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("keys match AGENT_EMOJIS entries exactly", () => {
    const labelKeys = Object.keys(AGENT_EMOJI_LABELS).sort();
    const emojisSorted = [...AGENT_EMOJIS].sort();
    expect(labelKeys).toEqual(emojisSorted);
  });
});
