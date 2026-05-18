import { describe, test, expect } from "vitest";
import { TARGET_TYPE_LABELS } from "@/lib/entity-links/types";
import type { TargetType } from "@/lib/entity-links/types";

describe("TARGET_TYPE_LABELS", () => {
  const ALL_TARGET_TYPES: TargetType[] = [
    "knowledge_item",
    "collection_record",
    "contact",
    "organization",
    "task",
    "url",
  ];

  test("has a label for every target type", () => {
    for (const t of ALL_TARGET_TYPES) {
      expect(TARGET_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  test("has no extra keys beyond the known target types", () => {
    expect(Object.keys(TARGET_TYPE_LABELS).sort()).toEqual(ALL_TARGET_TYPES.sort());
  });

  test("labels are human-readable strings", () => {
    for (const label of Object.values(TARGET_TYPE_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });
});
