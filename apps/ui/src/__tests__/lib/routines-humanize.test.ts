import { describe, test, expect } from "vitest";
import { humanizeRoutine } from "@/lib/routines/humanize";
import type { Routine } from "@/lib/routines/types";

function makeRoutine(overrides: Partial<Routine>): Routine {
  return {
    id: "r1",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    agent_id: "a1",
    agent_slug: "test-agent",
    name: "Test",
    instruction: "Do stuff",
    trigger_type: "schedule",
    is_active: true,
    cadence_type: null,
    interval_n: null,
    days_of_week: [],
    day_of_month: null,
    time_of_day: null,
    timezone: null,
    next_run_at: null,
    last_run_at: null,
    run_count: 0,
    entity_type: null,
    collection_id: null,
    field: null,
    condition: null,
    value: null,
    meta: {},
    archived_at: null,
    ...overrides,
  };
}

describe("humanizeRoutine — schedule", () => {
  test("every_n_minutes with default interval", () => {
    const r = makeRoutine({ cadence_type: "every_n_minutes" });
    expect(humanizeRoutine(r)).toBe("Every 15 minutes");
  });

  test("every_n_minutes with custom interval", () => {
    const r = makeRoutine({ cadence_type: "every_n_minutes", interval_n: 30 });
    expect(humanizeRoutine(r)).toBe("Every 30 minutes");
  });

  test("every_n_hours singular", () => {
    const r = makeRoutine({ cadence_type: "every_n_hours", interval_n: 1 });
    expect(humanizeRoutine(r)).toBe("Hourly");
  });

  test("every_n_hours plural", () => {
    const r = makeRoutine({ cadence_type: "every_n_hours", interval_n: 6 });
    expect(humanizeRoutine(r)).toBe("Every 6 hours");
  });

  test("daily without time", () => {
    const r = makeRoutine({ cadence_type: "daily" });
    expect(humanizeRoutine(r)).toBe("Daily");
  });

  test("daily with time", () => {
    const r = makeRoutine({ cadence_type: "daily", time_of_day: "09:00" });
    expect(humanizeRoutine(r)).toBe("Daily at 9 AM");
  });

  test("daily with time and timezone", () => {
    const r = makeRoutine({
      cadence_type: "daily",
      time_of_day: "14:30",
      timezone: "America/New_York",
    });
    expect(humanizeRoutine(r)).toBe("Daily at 2:30 PM America/New_York");
  });

  test("weekdays without time", () => {
    const r = makeRoutine({ cadence_type: "weekdays" });
    expect(humanizeRoutine(r)).toBe("Weekdays");
  });

  test("weekdays with time", () => {
    const r = makeRoutine({
      cadence_type: "weekdays",
      time_of_day: "08:00",
    });
    expect(humanizeRoutine(r)).toBe("Weekdays at 8 AM");
  });

  test("weekly with days", () => {
    const r = makeRoutine({
      cadence_type: "weekly",
      days_of_week: [1, 3, 5],
    });
    expect(humanizeRoutine(r)).toBe("Weekly on Mon, Wed, Fri");
  });

  test("weekly with days and time", () => {
    const r = makeRoutine({
      cadence_type: "weekly",
      days_of_week: [2],
      time_of_day: "12:00",
    });
    expect(humanizeRoutine(r)).toBe("Weekly on Tue at 12 PM");
  });

  test("weekly without days", () => {
    const r = makeRoutine({ cadence_type: "weekly", days_of_week: [] });
    expect(humanizeRoutine(r)).toBe("Weekly");
  });

  test("monthly", () => {
    const r = makeRoutine({ cadence_type: "monthly", day_of_month: 15 });
    expect(humanizeRoutine(r)).toBe("Monthly on the 15th");
  });

  test("monthly with time", () => {
    const r = makeRoutine({
      cadence_type: "monthly",
      day_of_month: 1,
      time_of_day: "09:00",
    });
    expect(humanizeRoutine(r)).toBe("Monthly on the 1st at 9 AM");
  });

  test("monthly 2nd", () => {
    const r = makeRoutine({ cadence_type: "monthly", day_of_month: 2 });
    expect(humanizeRoutine(r)).toBe("Monthly on the 2nd");
  });

  test("monthly 3rd", () => {
    const r = makeRoutine({ cadence_type: "monthly", day_of_month: 3 });
    expect(humanizeRoutine(r)).toBe("Monthly on the 3rd");
  });

  test("monthly 11th (teen exception)", () => {
    const r = makeRoutine({ cadence_type: "monthly", day_of_month: 11 });
    expect(humanizeRoutine(r)).toBe("Monthly on the 11th");
  });

  test("every_n_days", () => {
    const r = makeRoutine({ cadence_type: "every_n_days", interval_n: 3 });
    expect(humanizeRoutine(r)).toBe("Every 3 days");
  });

  test("every_n_days with time", () => {
    const r = makeRoutine({
      cadence_type: "every_n_days",
      interval_n: 2,
      time_of_day: "18:00",
    });
    expect(humanizeRoutine(r)).toBe("Every 2 days at 6 PM");
  });

  test("unknown cadence_type falls back to Scheduled", () => {
    const r = makeRoutine({ cadence_type: "custom" as never });
    expect(humanizeRoutine(r)).toBe("Scheduled");
  });
});

describe("humanizeRoutine — event", () => {
  test("created condition", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "task",
      condition: "created",
    });
    expect(humanizeRoutine(r)).toBe("When a task is created");
  });

  test("any_change with field", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "contact",
      condition: "any_change",
      field: "pipeline_stage_id",
    });
    expect(humanizeRoutine(r)).toBe("When a contact's stage changes");
  });

  test("any_change without field", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "contact",
      condition: "any_change",
    });
    expect(humanizeRoutine(r)).toBe("When a contact changes");
  });

  test("changed_to with field and value", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "task",
      condition: "changed_to",
      field: "status",
      value: "done",
    });
    expect(humanizeRoutine(r)).toBe('When a task\'s status changes to "done"');
  });

  test("changed_from with field and value", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "collection_record",
      condition: "changed_from",
      field: "stage_id",
      value: "active",
    });
    expect(humanizeRoutine(r)).toBe(
      'When a record\'s stage changes from "active"'
    );
  });

  test("changed_to without field falls back", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "knowledge_item",
      condition: "changed_to",
    });
    expect(humanizeRoutine(r)).toBe("When a knowledge item changes");
  });

  test("null entity_type defaults to entity", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: null,
      condition: "created",
    });
    expect(humanizeRoutine(r)).toBe("When a entity is created");
  });

  test("unknown condition falls back", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "task",
      condition: null,
    });
    expect(humanizeRoutine(r)).toBe("When a task changes");
  });

  test("field with underscores is humanized", () => {
    const r = makeRoutine({
      trigger_type: "event",
      entity_type: "task",
      condition: "any_change",
      field: "due_date",
    });
    expect(humanizeRoutine(r)).toBe("When a task's due date changes");
  });
});
