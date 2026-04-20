import type { FieldDefinition } from "@/lib/fields/types";
import type { ColumnMapping, ImportEntityType } from "./types";
import {
  CONTACT_FIELDS as CF,
  ORGANIZATION_FIELDS as OF,
} from "./types";

/** Aliases map: destination field key → possible source column names (lowercase) */
const KNOWN_ALIASES: Record<string, string[]> = {
  // Contact + shared
  name: ["name", "full name", "full_name", "contact name", "display name", "person", "organization name", "org name", "company name"],
  email: ["email", "email address", "e-mail", "mail", "email_address"],
  phone: ["phone", "phone number", "telephone", "mobile", "cell", "phone_number"],
  company: ["company", "company name", "organization", "org"],
  title: ["title", "job title", "role", "position", "job_title"],
  linkedin_url: ["linkedin", "linkedin url", "linkedin_url", "linkedin profile"],
  twitter_url: ["twitter", "twitter url", "twitter_url", "x", "x url"],
  website_url: ["website", "website url", "url", "web", "website_url"],
  location: ["location", "city", "address", "region", "country"],
  source: ["source", "lead source", "origin", "channel", "lead_source"],
  how_we_met: ["how we met", "how_we_met", "meeting context", "intro"],
  notes: ["notes", "description", "comments", "memo"],
  tags: ["tags", "labels", "categories"],
  priority: ["priority", "urgency"],
  relationship_strength: ["relationship", "relationship_strength", "strength", "relationship strength"],
  status: ["status", "stage", "pipeline stage", "pipeline_stage"],
  last_contact_date: ["last contact", "last contact date", "last_contact_date", "last contacted"],
  // Organization-specific
  type: ["type", "org type", "company type", "entity type", "org_type"],
  industry: ["industry", "sector", "vertical"],
  size: ["size", "company size", "headcount", "employees", "company_size"],
  website: ["website", "domain", "url", "web"],
  description: ["description", "about", "bio", "summary"],
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[_\-]/g, " ");
}

/** Build destination options for a given entity type */
export function getDestinationFields(
  entityType: ImportEntityType,
  fieldDefinitions: FieldDefinition[]
): { key: string; label: string; group: string }[] {
  const coreFields = entityType === "contact" ? CF : OF;
  const result: { key: string; label: string; group: string }[] = coreFields.map(
    (f) => ({ key: f.key, label: f.label, group: "Core" })
  );

  for (const fd of fieldDefinitions) {
    if (!fd.is_active) continue;
    result.push({
      key: `extended.${fd.field_key}`,
      label: fd.label,
      group: fd.field_group ?? "Custom",
    });
  }

  return result;
}

/** Auto-detect column mappings based on header names */
export function autoDetectMappings(
  headers: string[],
  entityType: ImportEntityType,
  fieldDefinitions: FieldDefinition[]
): ColumnMapping[] {
  const coreFields = entityType === "contact" ? CF : OF;
  const coreKeys = new Set(coreFields.map((f) => f.key));

  // Build reverse lookup: normalized alias → destination key
  const aliasMap = new Map<string, string>();
  for (const [destKey, aliases] of Object.entries(KNOWN_ALIASES)) {
    if (!coreKeys.has(destKey)) continue;
    for (const alias of aliases) {
      aliasMap.set(normalize(alias), destKey);
    }
  }

  // Also add custom field aliases (by field_key and label)
  for (const fd of fieldDefinitions) {
    if (!fd.is_active) continue;
    const extKey = `extended.${fd.field_key}`;
    aliasMap.set(normalize(fd.field_key), extKey);
    aliasMap.set(normalize(fd.label), extKey);
  }

  const usedDestinations = new Set<string>();
  const mappings: ColumnMapping[] = [];

  for (const header of headers) {
    const norm = normalize(header);
    const match = aliasMap.get(norm);

    if (match && !usedDestinations.has(match)) {
      usedDestinations.add(match);
      mappings.push({
        sourceColumn: header,
        destinationField: match,
        isCustomField: match.startsWith("extended."),
      });
    } else {
      mappings.push({
        sourceColumn: header,
        destinationField: null,
        isCustomField: false,
      });
    }
  }

  return mappings;
}
