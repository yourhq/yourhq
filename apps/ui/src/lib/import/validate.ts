import type { FieldDefinition } from "@/lib/fields/types";
import type {
  ImportContext,
  ValidationError,
  ValidatedRow,
} from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PRIORITY_VALUES = ["urgent", "high", "medium", "low"];
const STRENGTH_VALUES = ["stranger", "acquaintance", "warm", "strong"];
const ORG_TYPE_VALUES = ["company", "agency", "vc_firm", "community", "recruiting_firm", "other"];
const ORG_SIZE_VALUES = ["1-10", "11-50", "51-200", "201-1000", "1000+"];

function validateField(
  field: string,
  value: unknown,
  rowIndex: number,
  ctx: ImportContext
): ValidationError[] {
  const errors: ValidationError[] = [];
  const str = typeof value === "string" ? value.trim() : "";

  if (field === "name") {
    if (!str) {
      errors.push({ row: rowIndex, field, message: "Name is required", severity: "error" });
    }
    return errors;
  }

  if (field === "email" && str) {
    if (!EMAIL_RE.test(str)) {
      errors.push({ row: rowIndex, field, message: "Invalid email format", severity: "warning" });
    }
  }

  if (field === "priority" && str) {
    if (!PRIORITY_VALUES.includes(str.toLowerCase())) {
      errors.push({ row: rowIndex, field, message: `Invalid priority "${str}"`, severity: "warning" });
    }
  }

  if (field === "relationship_strength" && str) {
    if (!STRENGTH_VALUES.includes(str.toLowerCase())) {
      errors.push({ row: rowIndex, field, message: `Invalid strength "${str}"`, severity: "warning" });
    }
  }

  if (field === "status" && str) {
    const byKey = ctx.stages.find((s) => s.stage_key === str);
    const byLabel = ctx.stages.find((s) => s.label.toLowerCase() === str.toLowerCase());
    if (!byKey && !byLabel) {
      errors.push({ row: rowIndex, field, message: `Unknown stage "${str}" — will use default`, severity: "warning" });
    }
  }

  if (ctx.entityType === "organization") {
    if (field === "type" && str) {
      if (!ORG_TYPE_VALUES.includes(str.toLowerCase())) {
        errors.push({ row: rowIndex, field, message: `Invalid org type "${str}"`, severity: "warning" });
      }
    }
    if (field === "size" && str) {
      if (!ORG_SIZE_VALUES.includes(str)) {
        errors.push({ row: rowIndex, field, message: `Invalid size "${str}"`, severity: "warning" });
      }
    }
  }

  if (field === "last_contact_date" && str) {
    const d = new Date(str);
    if (isNaN(d.getTime())) {
      errors.push({ row: rowIndex, field, message: `Cannot parse date "${str}"`, severity: "warning" });
    }
  }

  // URL fields — warn if malformed
  if (["linkedin_url", "twitter_url", "website_url", "website"].includes(field) && str) {
    if (!str.startsWith("http://") && !str.startsWith("https://")) {
      errors.push({ row: rowIndex, field, message: "URL missing protocol — will add https://", severity: "warning" });
    }
  }

  return errors;
}

function validateCustomField(
  fieldKey: string,
  value: unknown,
  rowIndex: number,
  fd: FieldDefinition
): ValidationError[] {
  const errors: ValidationError[] = [];
  const str = typeof value === "string" ? value.trim() : "";

  if (fd.required && !str) {
    errors.push({ row: rowIndex, field: fieldKey, message: `${fd.label} is required`, severity: "error" });
    return errors;
  }

  if (!str) return errors;

  switch (fd.field_type) {
    case "number":
      if (isNaN(parseFloat(str))) {
        errors.push({ row: rowIndex, field: fieldKey, message: `${fd.label} must be a number`, severity: "warning" });
      }
      break;
    case "boolean":
      // Accept various truthy/falsy strings — no validation error needed
      break;
    case "date":
      if (isNaN(new Date(str).getTime())) {
        errors.push({ row: rowIndex, field: fieldKey, message: `Cannot parse date for ${fd.label}`, severity: "warning" });
      }
      break;
    case "select":
      if (fd.options && fd.options.length > 0 && !fd.options.includes(str)) {
        errors.push({ row: rowIndex, field: fieldKey, message: `"${str}" is not a valid option for ${fd.label}`, severity: "warning" });
      }
      break;
    case "multiselect": {
      if (fd.options && fd.options.length > 0) {
        const values = str.split(",").map((v) => v.trim()).filter(Boolean);
        const invalid = values.filter((v) => !fd.options!.includes(v));
        if (invalid.length > 0) {
          errors.push({ row: rowIndex, field: fieldKey, message: `Invalid option(s) for ${fd.label}: ${invalid.join(", ")}`, severity: "warning" });
        }
      }
      break;
    }
    case "url":
      if (!str.startsWith("http://") && !str.startsWith("https://")) {
        errors.push({ row: rowIndex, field: fieldKey, message: `URL missing protocol for ${fd.label}`, severity: "warning" });
      }
      break;
  }

  return errors;
}

/** Validate all transformed rows, returning ValidatedRow[] with per-cell errors */
export function validateRows(
  rows: Record<string, unknown>[],
  ctx: ImportContext
): ValidatedRow[] {
  const fdMap = new Map(ctx.fieldDefinitions.map((fd) => [fd.field_key, fd]));

  return rows.map((data, index) => {
    const allErrors: ValidationError[] = [];

    for (const [field, value] of Object.entries(data)) {
      if (field === "extended" && typeof value === "object" && value !== null) {
        // Validate each custom field inside extended
        for (const [extKey, extVal] of Object.entries(value as Record<string, unknown>)) {
          const fd = fdMap.get(extKey);
          if (fd) {
            allErrors.push(...validateCustomField(extKey, extVal, index, fd));
          }
        }
      } else {
        allErrors.push(...validateField(field, value, index, ctx));
      }
    }

    return {
      index,
      data,
      errors: allErrors,
      isValid: !allErrors.some((e) => e.severity === "error"),
    };
  });
}
