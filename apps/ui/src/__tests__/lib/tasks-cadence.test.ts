import { describe, test, expect } from "vitest";
import { shortCadenceLabel, longCadenceLabel } from "@/lib/tasks/cadence";
import type { TaskSeries } from "@/lib/tasks/types";

type CadenceFields = Pick<
  TaskSeries,
  "cadence_type" | "interval_n" | "days_of_week" | "day_of_month" | "time_of_day"
>;

function cadence(overrides: Partial<CadenceFields> & { cadence_type: CadenceFields["cadence_type"] }): CadenceFields {
  return {
    interval_n: 1,
    days_of_week: [],
    day_of_month: null,
    time_of_day: "09:00",
    ...overrides,
  };
}

describe("shortCadenceLabel", () => {
  test("daily", () => {
    expect(shortCadenceLabel(cadence({ cadence_type: "daily" }))).toBe("Daily");
  });

  test("weekdays", () => {
    expect(shortCadenceLabel(cadence({ cadence_type: "weekdays" }))).toBe("Weekdays");
  });

  test("every_n_days with interval 1", () => {
    expect(
      shortCadenceLabel(cadence({ cadence_type: "every_n_days", interval_n: 1 }))
    ).toBe("Daily");
  });

  test("every_n_days with interval > 1", () => {
    expect(
      shortCadenceLabel(cadence({ cadence_type: "every_n_days", interval_n: 3 }))
    ).toBe("Every 3d");
  });

  test("weekly without days", () => {
    expect(
      shortCadenceLabel(cadence({ cadence_type: "weekly", days_of_week: [] }))
    ).toBe("Weekly");
  });

  test("weekly with days shows short labels", () => {
    expect(
      shortCadenceLabel(
        cadence({ cadence_type: "weekly", days_of_week: [1, 3, 5] })
      )
    ).toBe("Weekly · MWF");
  });

  test("monthly with day_of_month", () => {
    expect(
      shortCadenceLabel(cadence({ cadence_type: "monthly", day_of_month: 15 }))
    ).toBe("Monthly · 15");
  });

  test("monthly with -1 shows Last", () => {
    expect(
      shortCadenceLabel(cadence({ cadence_type: "monthly", day_of_month: -1 }))
    ).toBe("Monthly · Last");
  });

  test("monthly with null day_of_month defaults to 1", () => {
    expect(
      shortCadenceLabel(cadence({ cadence_type: "monthly", day_of_month: null }))
    ).toBe("Monthly · 1");
  });

  test("unknown cadence_type falls back to Recurring", () => {
    expect(
      shortCadenceLabel(cadence({ cadence_type: "custom" as never }))
    ).toBe("Recurring");
  });
});

describe("longCadenceLabel", () => {
  test("appends formatted time", () => {
    expect(
      longCadenceLabel(cadence({ cadence_type: "daily", time_of_day: "09:00" }))
    ).toBe("Daily at 9:00 AM");
  });

  test("PM time", () => {
    expect(
      longCadenceLabel(cadence({ cadence_type: "daily", time_of_day: "14:30" }))
    ).toBe("Daily at 2:30 PM");
  });

  test("midnight", () => {
    expect(
      longCadenceLabel(cadence({ cadence_type: "daily", time_of_day: "00:00" }))
    ).toBe("Daily at 12:00 AM");
  });

  test("noon", () => {
    expect(
      longCadenceLabel(cadence({ cadence_type: "daily", time_of_day: "12:00" }))
    ).toBe("Daily at 12:00 PM");
  });
});
