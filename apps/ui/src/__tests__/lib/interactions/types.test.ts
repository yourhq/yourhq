import { describe, test, expect } from "vitest";
import {
  INTERACTION_TYPES,
  INTERACTION_DIRECTIONS,
} from "@/lib/interactions/types";

describe("INTERACTION_TYPES", () => {
  test("is a non-empty array", () => {
    expect(INTERACTION_TYPES.length).toBeGreaterThan(0);
  });

  test("each entry has value and label", () => {
    for (const t of INTERACTION_TYPES) {
      expect(t.value).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });

  test("has no duplicate values", () => {
    const values = INTERACTION_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });

  test("contains expected interaction types", () => {
    const values = INTERACTION_TYPES.map((t) => t.value);
    expect(values).toContain("email");
    expect(values).toContain("call");
    expect(values).toContain("meeting");
    expect(values).toContain("note");
  });
});

describe("INTERACTION_DIRECTIONS", () => {
  test("has inbound and outbound", () => {
    const values = INTERACTION_DIRECTIONS.map((d) => d.value);
    expect(values).toContain("inbound");
    expect(values).toContain("outbound");
  });
});
