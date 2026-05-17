"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FieldDefinition, FieldType } from "@/lib/fields/types";
import { useRealtimeSync } from "./use-realtime-sync";
import { slugify } from "@/lib/utils";
import { toast } from "sonner";

export interface AddFieldInput {
  label: string;
  field_type: FieldType;
  field_group?: string;
  required?: boolean;
  options?: string[];
  description?: string;
}

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

  useRealtimeSync<FieldDefinition>({
    table: "field_definitions",
    select: "*",
    items: fields,
    setItems: setFields,
    filter: `entity_type=eq.${entityType}`,
  });

  const addField = useCallback(
    async (input: AddFieldInput) => {
      const fieldKey = slugify(input.label);
      const maxSort = fields.reduce((max, f) => Math.max(max, f.sort_order), 0);
      const { data, error } = await supabase
        .from("field_definitions")
        .insert({
          entity_type: entityType,
          field_key: fieldKey,
          field_type: input.field_type,
          label: input.label.trim(),
          field_group: input.field_group || null,
          sort_order: maxSort + 1,
          required: input.required ?? false,
          options: input.options ?? null,
          description: input.description ?? null,
          is_active: true,
        })
        .select()
        .single();
      if (error) {
        toast.error(error.message.includes("duplicate") ? "A field with that name already exists" : "Failed to add property");
        return null;
      }
      setFields((prev) => [...prev, data as FieldDefinition]);
      return data as FieldDefinition;
    },
    [supabase, entityType, fields]
  );

  const updateField = useCallback(
    async (id: string, updates: Partial<Pick<FieldDefinition, "label" | "field_group" | "sort_order" | "required" | "options" | "description" | "is_active">>) => {
      const { error } = await supabase
        .from("field_definitions")
        .update(updates)
        .eq("id", id);
      if (error) {
        toast.error("Failed to update property");
        return false;
      }
      setFields((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
      );
      return true;
    },
    [supabase]
  );

  const deleteField = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("field_definitions")
        .delete()
        .eq("id", id);
      if (error) {
        toast.error("Failed to delete property");
        return false;
      }
      setFields((prev) => prev.filter((f) => f.id !== id));
      return true;
    },
    [supabase]
  );

  const reorderFields = useCallback(
    async (orderedIds: string[]) => {
      const reordered = orderedIds
        .map((id) => fields.find((f) => f.id === id))
        .filter(Boolean) as FieldDefinition[];
      setFields(reordered.map((f, i) => ({ ...f, sort_order: i })));

      const updates = orderedIds.map((id, i) =>
        supabase.from("field_definitions").update({ sort_order: i }).eq("id", id)
      );
      const results = await Promise.all(updates);
      if (results.some((r) => r.error)) {
        toast.error("Failed to reorder properties");
        fetchFields();
      }
    },
    [supabase, fields, fetchFields]
  );

  const fieldsByKey = useMemo(() => {
    const map: Record<string, FieldDefinition> = {};
    for (const f of fields) map[f.field_key] = f;
    return map;
  }, [fields]);

  const groupedFields = useMemo(() => {
    const groups: Record<string, FieldDefinition[]> = {};
    for (const f of fields) {
      if (!includeInactive && !f.is_active) continue;
      const group = f.field_group ?? "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(f);
    }
    return Object.entries(groups).map(([group, fields]) => ({
      group,
      fields: fields.sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [fields, includeInactive]);

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
    addField,
    updateField,
    deleteField,
    reorderFields,
  };
}
