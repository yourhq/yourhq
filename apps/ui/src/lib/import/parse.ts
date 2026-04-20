import Papa from "papaparse";

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  format: "csv" | "json";
  rowCount: number;
}

/** Strip UTF-8 BOM if present */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Parse a CSV string into headers + rows */
function parseCsv(text: string): ParseResult {
  const cleaned = stripBom(text);
  const result = Papa.parse<Record<string, string>>(cleaned, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  return {
    headers,
    rows: result.data,
    format: "csv",
    rowCount: result.data.length,
  };
}

/** Parse a JSON string — supports both `[{...}]` and `{ records: [{...}] }` */
function parseJson(text: string): ParseResult {
  const cleaned = stripBom(text);
  const parsed = JSON.parse(cleaned);

  let records: Record<string, unknown>[];
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    // Airtable-style wrapper — find the first array property
    const arrayProp = Object.values(parsed).find(Array.isArray) as
      | Record<string, unknown>[]
      | undefined;
    if (arrayProp) {
      records = arrayProp;
    } else {
      throw new Error("JSON must be an array of objects or contain an array property");
    }
  } else {
    throw new Error("JSON must be an array of objects");
  }

  if (records.length === 0) {
    return { headers: [], rows: [], format: "json", rowCount: 0 };
  }

  // Collect all unique keys across all records
  const headerSet = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);

  // Convert all values to strings for uniform handling
  const rows = records.map((record) => {
    const row: Record<string, string> = {};
    for (const key of headers) {
      const val = record[key];
      if (val === null || val === undefined) {
        row[key] = "";
      } else if (Array.isArray(val)) {
        row[key] = val.join(", ");
      } else {
        row[key] = String(val);
      }
    }
    return row;
  });

  return { headers, rows, format: "json", rowCount: rows.length };
}

/** Detect format from file extension and parse */
export async function parseFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "json") {
    return parseJson(text);
  }
  // Default to CSV for .csv or unknown extensions
  return parseCsv(text);
}

/** Auto-detect format from content and parse (for pasted text) */
export function parseText(text: string): ParseResult {
  const trimmed = stripBom(text).trim();
  // If it starts with [ or { it's likely JSON
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return parseJson(trimmed);
    } catch {
      // Fall through to CSV if JSON parse fails
    }
  }
  return parseCsv(trimmed);
}
