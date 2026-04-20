"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FieldDefinition } from "@/lib/fields/types";
import { useRealtimeSync } from "./use-realtime-sync";

/**
 * Fetches custom field definitions for a given entity type.
 * Replaces hardcoded form sections. Cached in state; refreshable on demand.
 *
 * By default, only returns active fields. Pass `includeInactive: true` for
 * the Settings page.
 */
export function useFieldDefinitions(
  entityType: string = "contact",
  options: { includeInactive?: boolean } = {}
) {
  const { includeInactive = false } = options;
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("field_definitions")
      .select("*")
      .eq("entity_type", entityType)
      .order("sort_order", { ascending: true });
    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    const { data, error } = await query;
    if (!error && data) {
      setFields(data as FieldDefinition[]);
    }
    setLoading(false);
  }, [supabase, entityType, includeInactive]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFields();
  }, [fetchFields]);

  // Realtime: stay in sync with Settings edits
  useRealtimeSync<FieldDefinition>({
    table: "field_definitions",
    select: "*",
    items: fields,
    setItems: setFields,
    filter: `entity_type=eq.${entityType}`,
  });

  const fieldsByKey = useMemo(() => {
    const map: Record<string, FieldDefinition> = {};
    for (const f of fields) map[f.field_key] = f;
    return map;
  }, [fields]);

  /** Fields grouped by `field_group` (null group → "Other"). Preserves sort_order. */
  const groupedFields = useMemo(() => {
    const groups: Record<string, FieldDefinition[]> = {};
    for (const f of fields) {
      if (!includeInactive && !f.is_active) continue;
      const group = f.field_group ?? "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(f);
    }
    // Return as array of { group, fields } for stable ordering
    return Object.entries(groups).map(([group, fields]) => ({
      group,
      fields: fields.sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [fields, includeInactive]);

  /** Only fields that have a field_group set (for form rendering). */
  const activeGroupedFields = useMemo(
    () => groupedFields.filter((g) => g.fields.length > 0),
    [groupedFields]
  );

  return {
    fields,
    fieldsByKey,
    groupedFields: activeGroupedFields,
    loading,
    refresh: fetchFields,
  };
}
