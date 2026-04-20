import type { ColumnMapping, ImportContext } from "./types";

const TRUTHY = new Set(["true", "yes", "1", "y", "on"]);

/** Apply column mappings to raw rows, producing insert-ready objects */
export function transformRows(
  rawRows: Record<string, string>[],
  mappings: ColumnMapping[],
  ctx: ImportContext
): Record<string, unknown>[] {
  const activeMappings = mappings.filter((m) => m.destinationField !== null);

  return rawRows.map((raw) => {
    const record: Record<string, unknown> = {};
    const extended: Record<string, unknown> = {};

    for (const mapping of activeMappings) {
      const rawValue = raw[mapping.sourceColumn] ?? "";
      const trimmed = rawValue.trim();
      const dest = mapping.destinationField!;

      if (mapping.isCustomField) {
        const extKey = dest.replace("extended.", "");
        const fd = ctx.fieldDefinitions.find((f) => f.field_key === extKey);
        if (!trimmed) continue;

        if (fd) {
          switch (fd.field_type) {
            case "number":
              extended[extKey] = parseFloat(trimmed) || 0;
              break;
            case "boolean":
              extended[extKey] = TRUTHY.has(trimmed.toLowerCase());
              break;
            case "multiselect":
              extended[extKey] = trimmed.split(",").map((v) => v.trim()).filter(Boolean);
              break;
            case "date":
              extended[extKey] = new Date(trimmed).toISOString();
              break;
            default:
              extended[extKey] = trimmed;
          }
        } else {
          extended[extKey] = trimmed;
        }
        continue;
      }

      // Core fields
      switch (dest) {
        case "tags":
          record.tags = trimmed
            ? trimmed.split(",").map((t) => t.trim()).filter(Boolean)
            : [];
          break;

        case "status": {
          // Try stage_key match first, then label match
          const byKey = ctx.stages.find((s) => s.stage_key === trimmed);
          if (byKey) {
            record.status = byKey.stage_key;
          } else {
            const byLabel = ctx.stages.find(
              (s) => s.label.toLowerCase() === trimmed.toLowerCase()
            );
            record.status = byLabel ? byLabel.stage_key : ctx.defaultStageKey;
          }
          break;
        }

        case "priority":
          record.priority = ["urgent", "high", "medium", "low"].includes(
            trimmed.toLowerCase()
          )
            ? trimmed.toLowerCase()
            : null;
          break;

        case "relationship_strength":
          record.relationship_strength = [
            "stranger",
            "acquaintance",
            "warm",
            "strong",
          ].includes(trimmed.toLowerCase())
            ? trimmed.toLowerCase()
            : "stranger";
          break;

        case "last_contact_date": {
          const d = new Date(trimmed);
          record.last_contact_date = !isNaN(d.getTime())
            ? d.toISOString()
            : null;
          break;
        }

        case "type":
          if (ctx.entityType === "organization") {
            const valid = [
              "company",
              "agency",
              "vc_firm",
              "community",
              "recruiting_firm",
              "other",
            ];
            record.type = valid.includes(trimmed.toLowerCase())
              ? trimmed.toLowerCase()
              : null;
          } else {
            record[dest] = trimmed || null;
          }
          break;

        case "size":
          if (ctx.entityType === "organization") {
            const valid = ["1-10", "11-50", "51-200", "201-1000", "1000+"];
            record.size = valid.includes(trimmed) ? trimmed : null;
          } else {
            record[dest] = trimmed || null;
          }
          break;

        // URL fields — auto-prefix https://
        case "linkedin_url":
        case "twitter_url":
        case "website_url":
        case "website":
          if (trimmed && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            record[dest] = `https://${trimmed}`;
          } else {
            record[dest] = trimmed || null;
          }
          break;

        default:
          record[dest] = trimmed || null;
          break;
      }
    }

    // Set defaults
    if (!record.status && ctx.defaultStageKey) {
      record.status = ctx.defaultStageKey;
    }
    if (ctx.entityType === "contact") {
      if (!record.relationship_strength) {
        record.relationship_strength = "stranger";
      }
    }
    if (!record.tags) {
      record.tags = [];
    }

    // Attach extended if any custom fields mapped
    if (Object.keys(extended).length > 0) {
      record.extended = extended;
    } else {
      record.extended = {};
    }

    return record;
  });
}
