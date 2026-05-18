import { describe, test, expect } from "vitest";
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ICONS,
  VIEW_TYPE_LABELS,
  VIEW_TYPE_ICONS,
  DEFAULT_COLLECTION_COLOR,
  CREATABLE_FIELD_TYPES,
} from "@/lib/collections/types";
import type { CollectionFieldType, CollectionViewType } from "@/lib/collections/types";

const ALL_FIELD_TYPES: CollectionFieldType[] = [
  "text", "number", "date", "datetime", "boolean", "select",
  "multi_select", "url", "email", "phone", "relation", "rich_text",
];

const ALL_VIEW_TYPES: CollectionViewType[] = ["table", "kanban", "calendar"];

describe("FIELD_TYPE_LABELS", () => {
  test("has a label for every field type", () => {
    for (const t of ALL_FIELD_TYPES) {
      expect(FIELD_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  test("no extra keys", () => {
    expect(Object.keys(FIELD_TYPE_LABELS).sort()).toEqual(ALL_FIELD_TYPES.sort());
  });
});

describe("FIELD_TYPE_ICONS", () => {
  test("has an icon for every field type", () => {
    for (const t of ALL_FIELD_TYPES) {
      expect(FIELD_TYPE_ICONS[t]).toBeTruthy();
    }
  });
});

describe("VIEW_TYPE_LABELS", () => {
  test("has a label for every view type", () => {
    for (const t of ALL_VIEW_TYPES) {
      expect(VIEW_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});

describe("VIEW_TYPE_ICONS", () => {
  test("has an icon for every view type", () => {
    for (const t of ALL_VIEW_TYPES) {
      expect(VIEW_TYPE_ICONS[t]).toBeTruthy();
    }
  });
});

describe("DEFAULT_COLLECTION_COLOR", () => {
  test("is a hex color string", () => {
    expect(DEFAULT_COLLECTION_COLOR).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("CREATABLE_FIELD_TYPES", () => {
  test("is a non-empty array", () => {
    expect(CREATABLE_FIELD_TYPES.length).toBeGreaterThan(0);
  });

  test("all creatable types are valid field types", () => {
    for (const t of CREATABLE_FIELD_TYPES) {
      expect(ALL_FIELD_TYPES).toContain(t);
    }
  });

  test("excludes relation and rich_text", () => {
    expect(CREATABLE_FIELD_TYPES).not.toContain("relation");
    expect(CREATABLE_FIELD_TYPES).not.toContain("rich_text");
  });
});
