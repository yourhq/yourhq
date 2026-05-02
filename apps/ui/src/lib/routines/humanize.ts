import type { Routine } from "./types";
import { DAYS_OF_WEEK_LABELS } from "./types";

export function humanizeRoutine(routine: Routine): string {
  if (routine.trigger_type === "schedule") {
    return humanizeSchedule(routine);
  }
  return humanizeEvent(routine);
}

function humanizeSchedule(r: Routine): string {
  const time = r.time_of_day ? formatTime(r.time_of_day) : null;
  const tz = r.timezone ? ` ${r.timezone}` : "";

  switch (r.cadence_type) {
    case "every_n_minutes":
      return `Every ${r.interval_n ?? 15} minutes`;
    case "every_n_hours":
      return r.interval_n === 1 ? "Hourly" : `Every ${r.interval_n ?? 1} hours`;
    case "daily":
      return time ? `Daily at ${time}${tz}` : "Daily";
    case "weekdays":
      return time ? `Weekdays at ${time}${tz}` : "Weekdays";
    case "weekly": {
      const days = (r.days_of_week ?? [])
        .map((d) => DAYS_OF_WEEK_LABELS[d - 1] ?? `${d}`)
        .join(", ");
      const base = days ? `Weekly on ${days}` : "Weekly";
      return time ? `${base} at ${time}${tz}` : base;
    }
    case "monthly": {
      const day = r.day_of_month ?? 1;
      const suffix = ordinalSuffix(day);
      return time
        ? `Monthly on the ${day}${suffix} at ${time}${tz}`
        : `Monthly on the ${day}${suffix}`;
    }
    case "every_n_days":
      return time
        ? `Every ${r.interval_n ?? 1} days at ${time}${tz}`
        : `Every ${r.interval_n ?? 1} days`;
    default:
      return "Scheduled";
  }
}

function humanizeEvent(r: Routine): string {
  const entity = humanizeEntityType(r.entity_type);

  switch (r.condition) {
    case "created":
      return `When a ${entity} is created`;
    case "any_change":
      return r.field
        ? `When a ${entity}'s ${humanizeField(r.field)} changes`
        : `When a ${entity} changes`;
    case "changed_to":
      return r.field && r.value
        ? `When a ${entity}'s ${humanizeField(r.field)} changes to "${r.value}"`
        : `When a ${entity} changes`;
    case "changed_from":
      return r.field && r.value
        ? `When a ${entity}'s ${humanizeField(r.field)} changes from "${r.value}"`
        : `When a ${entity} changes`;
    default:
      return `When a ${entity} changes`;
  }
}

function humanizeEntityType(entityType: string | null): string {
  switch (entityType) {
    case "contact":
      return "contact";
    case "collection_record":
      return "record";
    case "knowledge_item":
      return "knowledge item";
    case "task":
      return "task";
    default:
      return entityType ?? "entity";
  }
}

function humanizeField(field: string): string {
  const lookup: Record<string, string> = {
    pipeline_stage_id: "stage",
    stage_id: "stage",
  };
  return lookup[field] ?? field.replace(/_/g, " ");
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return m === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
