import { describe, it, expect } from "vitest";
import {
  TASK_STATUSES,
  STATUS_COLORS,
  STATUS_ICONS,
  type TaskStatus,
} from "@/lib/tasks/types";

describe("Task status constants", () => {
  it("defines all six status values", () => {
    const values = TASK_STATUSES.map((s) => s.value);
    expect(values).toEqual([
      "todo",
      "in_progress",
      "blocked",
      "done",
      "cancelled",
      "missed",
    ]);
  });

  it("has a human-readable label for every status", () => {
    for (const s of TASK_STATUSES) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("maps correct labels", () => {
    const map = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.label]));
    expect(map.todo).toBe("To Do");
    expect(map.in_progress).toBe("In Progress");
    expect(map.blocked).toBe("Blocked");
    expect(map.done).toBe("Done");
    expect(map.cancelled).toBe("Cancelled");
    expect(map.missed).toBe("Missed");
  });

  it("has a color class for every status", () => {
    const statuses: TaskStatus[] = [
      "todo",
      "in_progress",
      "blocked",
      "done",
      "cancelled",
      "missed",
    ];
    for (const s of statuses) {
      expect(STATUS_COLORS[s]).toBeDefined();
      expect(STATUS_COLORS[s].length).toBeGreaterThan(0);
    }
  });

  it("assigns distinct color groups", () => {
    expect(STATUS_COLORS.in_progress).toContain("info");
    expect(STATUS_COLORS.blocked).toContain("error");
    expect(STATUS_COLORS.done).toContain("success");
    expect(STATUS_COLORS.missed).toContain("warning");
  });

  it("has an icon name for every status", () => {
    const statuses: TaskStatus[] = [
      "todo",
      "in_progress",
      "blocked",
      "done",
      "cancelled",
      "missed",
    ];
    for (const s of statuses) {
      expect(STATUS_ICONS[s]).toBeDefined();
      expect(STATUS_ICONS[s].length).toBeGreaterThan(0);
    }
  });

  it("maps expected icon names", () => {
    expect(STATUS_ICONS.todo).toBe("circle");
    expect(STATUS_ICONS.in_progress).toBe("loader");
    expect(STATUS_ICONS.blocked).toBe("alert-circle");
    expect(STATUS_ICONS.done).toBe("check-circle-2");
    expect(STATUS_ICONS.cancelled).toBe("x-circle");
    expect(STATUS_ICONS.missed).toBe("clock-alert");
  });
});
