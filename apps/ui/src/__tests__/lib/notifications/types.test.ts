import { describe, test, expect } from "vitest";
import { NOTIFICATION_TYPE_LABELS } from "@/lib/notifications/types";

describe("NOTIFICATION_TYPE_LABELS", () => {
  test("has labels for core notification types", () => {
    expect(NOTIFICATION_TYPE_LABELS["follow_up"]).toBe("Follow-up");
    expect(NOTIFICATION_TYPE_LABELS["task_assigned"]).toBe("Task assigned");
    expect(NOTIFICATION_TYPE_LABELS["task_completed"]).toBe("Task completed");
    expect(NOTIFICATION_TYPE_LABELS["task_blocked"]).toBe("Task blocked");
    expect(NOTIFICATION_TYPE_LABELS["task_overdue"]).toBe("Task overdue");
    expect(NOTIFICATION_TYPE_LABELS["deliverable_submitted"]).toBe("Deliverable");
    expect(NOTIFICATION_TYPE_LABELS["system"]).toBe("System");
    expect(NOTIFICATION_TYPE_LABELS["budget.warned"]).toBe("Budget warning");
    expect(NOTIFICATION_TYPE_LABELS["budget.exceeded"]).toBe("Budget exceeded");
  });

  test("all labels are non-empty strings", () => {
    for (const label of Object.values(NOTIFICATION_TYPE_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
