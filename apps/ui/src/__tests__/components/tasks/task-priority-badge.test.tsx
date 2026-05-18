import { describe, it, expect } from "vitest";
import {
  TASK_PRIORITIES,
  PRIORITY_COLORS,
  type TaskPriority,
} from "@/lib/tasks/types";

describe("Task priority constants", () => {
  it("defines all four priority values in order", () => {
    const values = TASK_PRIORITIES.map((p) => p.value);
    expect(values).toEqual(["urgent", "high", "medium", "low"]);
  });

  it("has a human-readable label for every priority", () => {
    for (const p of TASK_PRIORITIES) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it("maps correct labels", () => {
    const map = Object.fromEntries(
      TASK_PRIORITIES.map((p) => [p.value, p.label])
    );
    expect(map.urgent).toBe("Urgent");
    expect(map.high).toBe("High");
    expect(map.medium).toBe("Medium");
    expect(map.low).toBe("Low");
  });

  it("has a color class for every priority", () => {
    const priorities: TaskPriority[] = ["urgent", "high", "medium", "low"];
    for (const p of priorities) {
      expect(PRIORITY_COLORS[p]).toBeDefined();
      expect(PRIORITY_COLORS[p].length).toBeGreaterThan(0);
    }
  });

  it("assigns priority-specific color tokens", () => {
    expect(PRIORITY_COLORS.urgent).toContain("priority-urgent");
    expect(PRIORITY_COLORS.high).toContain("priority-high");
    expect(PRIORITY_COLORS.medium).toContain("priority-medium");
    expect(PRIORITY_COLORS.low).toContain("priority-low");
  });

  it("all colors include both bg and text classes", () => {
    const priorities: TaskPriority[] = ["urgent", "high", "medium", "low"];
    for (const p of priorities) {
      expect(PRIORITY_COLORS[p]).toContain("bg-");
      expect(PRIORITY_COLORS[p]).toContain("text-");
    }
  });
});
