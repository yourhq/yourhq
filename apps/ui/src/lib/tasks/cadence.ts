import type { TaskSeries } from "./types";
import { DAY_OF_WEEK_LABELS } from "./types";
import { formatTimeOfDay } from "@/lib/workspace/timezone";

type CadenceFields = Pick<
  TaskSeries,
  "cadence_type" | "interval_n" | "days_of_week" | "day_of_month" | "time_of_day"
>;

/** Short label for list rows: "Daily", "Weekly · MWF", "Monthly · 1st", etc. */
export function shortCadenceLabel(c: CadenceFields): string {
  switch (c.cadence_type) {
    case "daily":
      return "Daily";
    case "weekdays":
      return "Weekdays";
    case "every_n_days":
      return c.interval_n === 1 ? "Daily" : `Every ${c.interval_n}d`;
    case "weekly": {
      const days = (c.days_of_week ?? [])
        .map((d) => DAY_OF_WEEK_LABELS.find((l) => l.value === d)?.short)
        .filter(Boolean)
        .join("");
      return days ? `Weekly · ${days}` : "Weekly";
    }
    case "monthly": {
      if (c.day_of_month === -1) return "Monthly · Last";
      return `Monthly · ${c.day_of_month ?? 1}`;
    }
    default:
      return "Recurring";
  }
}

/** Full label with time, for detail/tooltip: "Daily at 9:00 AM". */
export function longCadenceLabel(c: CadenceFields): string {
  const time = formatTimeOfDay(c.time_of_day);
  return `${shortCadenceLabel(c)} at ${time}`;
}
