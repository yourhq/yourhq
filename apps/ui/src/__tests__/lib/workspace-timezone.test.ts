import { describe, test, expect } from "vitest";
import { formatTimeOfDay, localWallToUtcIso } from "@/lib/workspace/timezone";

describe("formatTimeOfDay", () => {
  test("formats morning time", () => {
    expect(formatTimeOfDay("09:00")).toBe("9:00 AM");
  });

  test("formats afternoon time", () => {
    expect(formatTimeOfDay("14:30")).toBe("2:30 PM");
  });

  test("formats midnight as 12:00 AM", () => {
    expect(formatTimeOfDay("00:00")).toBe("12:00 AM");
  });

  test("formats noon as 12:00 PM", () => {
    expect(formatTimeOfDay("12:00")).toBe("12:00 PM");
  });

  test("formats 1 AM", () => {
    expect(formatTimeOfDay("01:05")).toBe("1:05 AM");
  });

  test("formats 11 PM", () => {
    expect(formatTimeOfDay("23:45")).toBe("11:45 PM");
  });

  test("handles time with seconds (ignores seconds)", () => {
    expect(formatTimeOfDay("08:30:15")).toBe("8:30 AM");
  });
});

describe("localWallToUtcIso", () => {
  test("converts UTC wall time to UTC ISO (no offset)", () => {
    const result = localWallToUtcIso("2025-03-15", "09:00", "UTC");
    expect(result).toBe("2025-03-15T09:00:00.000Z");
  });

  test("converts US Eastern wall time to UTC", () => {
    const result = localWallToUtcIso("2025-06-15", "09:00", "America/New_York");
    expect(result).toBe("2025-06-15T13:00:00.000Z");
  });

  test("converts US Eastern winter time (EST) to UTC", () => {
    const result = localWallToUtcIso("2025-01-15", "09:00", "America/New_York");
    expect(result).toBe("2025-01-15T14:00:00.000Z");
  });

  test("handles time with seconds", () => {
    const result = localWallToUtcIso("2025-06-15", "09:30:45", "UTC");
    expect(result).toBe("2025-06-15T09:30:45.000Z");
  });

  test("converts Asia/Tokyo to UTC", () => {
    const result = localWallToUtcIso("2025-06-15", "09:00", "Asia/Tokyo");
    expect(result).toBe("2025-06-15T00:00:00.000Z");
  });

  test("handles midnight", () => {
    const result = localWallToUtcIso("2025-03-15", "00:00", "UTC");
    expect(result).toBe("2025-03-15T00:00:00.000Z");
  });
});
