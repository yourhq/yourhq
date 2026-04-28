import type { AutomationRule } from "./types";

// Turns an automation_rule row into a one-line, English sentence —
// e.g. "When a contact's stage changes to Qualified". Used by the
// agent detail page's Triggers section so operators don't have to
// read the (table_name, field, condition, value) shape directly.
//
// The schema permits any table_name, but in practice today only
// contacts is wired in. Unknown tables fall back to "When <table>
// changes" rather than throwing.

export function humanizeAutomationRule(rule: AutomationRule): string {
  const subject = humanizeTable(rule.table_name);
  const noun = subject.singular;

  switch (rule.condition) {
    case "created":
      return `When a ${noun} is created`;
    case "any_change":
      if (rule.field) {
        return `When a ${noun}'s ${humanizeField(rule.field)} changes`;
      }
      return `When a ${noun} changes`;
    case "changed_to":
      if (rule.field && rule.value) {
        return `When a ${noun}'s ${humanizeField(rule.field)} changes to ${humanizeValue(
          rule.value,
        )}`;
      }
      return `When a ${noun} changes`;
    case "changed_from":
      if (rule.field && rule.value) {
        return `When a ${noun}'s ${humanizeField(rule.field)} changes from ${humanizeValue(
          rule.value,
        )}`;
      }
      return `When a ${noun} changes`;
    default:
      return `When a ${noun} changes`;
  }
}

// Map a Postgres table name to a singular noun the rule sentence reads
// naturally with. Add cases here as new tables get automation support.
function humanizeTable(tableName: string): { singular: string; plural: string } {
  switch (tableName) {
    case "contacts":
      return { singular: "contact", plural: "contacts" };
    case "organizations":
      return { singular: "organization", plural: "organizations" };
    case "tasks":
      return { singular: "task", plural: "tasks" };
    default:
      return { singular: tableName, plural: tableName };
  }
}

// Field name → human label. Most schema fields are already plain words
// (`stage`, `email`, `name`); only those with weird casing or domain
// jargon need a mapping.
function humanizeField(field: string): string {
  const lookup: Record<string, string> = {
    pipeline_stage_id: "stage",
    stage_id: "stage",
  };
  return lookup[field] ?? field.replace(/_/g, " ");
}

// Wrap user-supplied values in **bold**-ish quotes so they stand out
// in the sentence. We could italicize via JSX in the renderer, but
// keeping this a pure string helper means the same humanizer feeds
// tooltips, audit summaries, and search results without forking.
function humanizeValue(value: string): string {
  return `"${value}"`;
}
