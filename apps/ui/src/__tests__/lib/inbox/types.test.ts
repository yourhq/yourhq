import { describe, test, expect } from "vitest";
import {
  INBOX_STATUSES,
  INBOX_STATUS_COLORS,
  INBOX_STATUS_BG,
} from "@/lib/inbox/types";
import type { InboxItemStatus } from "@/lib/inbox/types";

const ALL_STATUSES: InboxItemStatus[] = ["pending", "leased", "done", "failed", "dead_letter"];

describe("INBOX_STATUSES", () => {
  test("covers all status values", () => {
    const values = INBOX_STATUSES.map((s) => s.value);
    expect(values.sort()).toEqual(ALL_STATUSES.sort());
  });

  test("each status has a label", () => {
    for (const s of INBOX_STATUSES) {
      expect(s.label).toBeTruthy();
    }
  });
});

describe("INBOX_STATUS_COLORS", () => {
  test("has a color for every status", () => {
    for (const s of ALL_STATUSES) {
      expect(INBOX_STATUS_COLORS[s]).toBeTruthy();
    }
  });
});

describe("INBOX_STATUS_BG", () => {
  test("has classes for every status", () => {
    for (const s of ALL_STATUSES) {
      expect(INBOX_STATUS_BG[s]).toBeTruthy();
    }
  });
});
