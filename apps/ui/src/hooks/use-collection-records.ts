"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  CollectionField,
  CollectionRecord,
  CollectionView,
  CollectionFieldType,
  ViewConfig,
  CollectionViewType,
  FieldOptions,
} from "@/lib/collections/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

function updateUrl(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === "" || v === "all") {
      url.searchParams.delete(k);
    } else {
      url.searchParams.set(k, v);
    }
  }
  window.history.replaceState(null, "", url.toString());
}

export function useCollectionRecords(collectionId: string) {
  const searchParams = useSearchParams();
  const [records, setRecords] = useState<CollectionRecord[]>([]);
  const [fields, setFields] = useState<CollectionField[]>([]);
  const [views, setViews] = useState<CollectionView[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const [search, setSearchState] = useState(searchParams.get("q") ?? "");
  const [showArchived, setShowArchivedState] = useState(
    searchParams.get("archived") === "1",
  );
  const [activeViewId, setActiveViewIdState] = useState<string | null>(
    searchParams.get("view") ?? null,
  );

  function setSearch(v: string) {
    setSearchState(v);
    updateUrl({ q: v || null });
  }

  function setShowArchived(v: boolean) {
    setShowArchivedState(v);
    updateUrl({ archived: v ? "1" : null });
  }

  const setActiveViewId = useCallback((v: string | null) => {
    setActiveViewIdState(v);
    updateUrl({ view: v });
  }, []);

  // ── Fetchers ──────────────────────────────────────────────────

  const fetchFields = useCallback(async () => {
    const { data } = await supabase
      .from("collection_fields")
      .select("*")
      .eq("collection_id", collectionId)
      .order("sort_order", { ascending: true });
    setFields(data ?? []);
  }, [supabase, collectionId]);

  const fetchRecords = useCallback(async () => {
    let q = supabase
      .from("collection_records")
      .select("*")
      .eq("collection_id", collectionId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (!showArchived) {
      q = q.is("archived_at", null);
    }

    const { data } = await q;
    setRecords(data ?? []);
    setLoading(false);
  }, [supabase, collectionId, showArchived]);

  const fetchViews = useCallback(async () => {
    const { data } = await supabase
      .from("collection_views")
      .select("*")
      .eq("collection_id", collectionId)
      .order("sort_order", { ascending: true });
    setViews(data ?? []);
  }, [supabase, collectionId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchFields();
    fetchRecords();
    fetchViews();
  }, [fetchFields, fetchRecords, fetchViews]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "collection_records",
    filter: `collection_id=eq.${collectionId}`,
    onPayload: () => fetchRecords(),
  });

  useRealtime({
    table: "collection_fields",
    filter: `collection_id=eq.${collectionId}`,
    onPayload: () => fetchFields(),
  });

  // ── Active view ───────────────────────────────────────────────

  const activeView = useMemo(() => {
    if (activeViewId) return views.find((v) => v.id === activeViewId) ?? views.find((v) => v.is_default) ?? views[0] ?? null;
    return views.find((v) => v.is_default) ?? views[0] ?? null;
  }, [views, activeViewId]);

  // ── Record CRUD ───────────────────────────────────────────────

  const createRecord = useCallback(
    async (values: Record<string, unknown> = {}): Promise<CollectionRecord | null> => {
      const defaults: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.default_value !== null && f.default_value !== undefined && values[f.field_key] === undefined) {
          defaults[f.field_key] = f.default_value;
        }
      }

      const { data, error } = await supabase
        .from("collection_records")
        .insert({
          collection_id: collectionId,
          values: { ...defaults, ...values },
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return null;
      }

      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection_record",
        entity_id: data.id,
        action: "created",
        summary: "Created record",
      });

      fetchRecords();
      return data;
    },
    [supabase, collectionId, fields, fetchRecords],
  );

  const updateRecord = useCallback(
    async (recordId: string, values: Record<string, unknown>) => {
      const { error } = await supabase
        .from("collection_records")
        .update({ values })
        .eq("id", recordId);

      if (error) {
        toast.error(error.message);
        return;
      }

      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection_record",
        entity_id: recordId,
        action: "updated",
        summary: "Updated record",
      });

      fetchRecords();
    },
    [supabase, fetchRecords],
  );

  const updateCell = useCallback(
    async (recordId: string, fieldKey: string, value: unknown) => {
      const record = records.find((r) => r.id === recordId);
      if (!record) return;
      const newValues = { ...record.values, [fieldKey]: value };

      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, values: newValues } : r)),
      );

      const { error } = await supabase
        .from("collection_records")
        .update({ values: newValues })
        .eq("id", recordId);

      if (error) {
        toast.error(error.message);
        fetchRecords();
      }
    },
    [supabase, records, fetchRecords],
  );

  const archiveRecord = useCallback(
    async (recordId: string) => {
      const { error } = await supabase
        .from("collection_records")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", recordId);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection_record",
        entity_id: recordId,
        action: "archived",
        summary: "Archived record",
      });
      fetchRecords();
    },
    [supabase, fetchRecords],
  );

  const deleteRecord = useCallback(
    async (recordId: string) => {
      const { error } = await supabase
        .from("collection_records")
        .delete()
        .eq("id", recordId);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection_record",
        entity_id: recordId,
        action: "deleted",
        summary: "Deleted record",
      });
      fetchRecords();
    },
    [supabase, fetchRecords],
  );

  // ── Field CRUD ────────────────────────────────────────────────

  const addField = useCallback(
    async (input: {
      field_key: string;
      field_type: CollectionFieldType;
      label: string;
      required?: boolean;
      options?: FieldOptions;
      is_title_field?: boolean;
    }) => {
      const maxSort = fields.reduce((m, f) => Math.max(m, f.sort_order), -1);
      const { error } = await supabase.from("collection_fields").insert({
        collection_id: collectionId,
        field_key: input.field_key,
        field_type: input.field_type,
        label: input.label,
        sort_order: maxSort + 1,
        required: input.required ?? false,
        options: input.options ?? null,
        is_title_field: input.is_title_field ?? false,
      });

      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Added field "${input.label}"`);
      fetchFields();
    },
    [supabase, collectionId, fields, fetchFields],
  );

  const updateField = useCallback(
    async (
      fieldId: string,
      updates: Partial<Pick<CollectionField, "label" | "field_type" | "required" | "options" | "is_title_field" | "sort_order" | "is_active">>,
    ) => {
      const { error } = await supabase
        .from("collection_fields")
        .update(updates)
        .eq("id", fieldId);
      if (error) {
        toast.error(error.message);
        return;
      }
      fetchFields();
    },
    [supabase, fetchFields],
  );

  const deleteField = useCallback(
    async (fieldId: string) => {
      const field = fields.find((f) => f.id === fieldId);
      const { error } = await supabase
        .from("collection_fields")
        .delete()
        .eq("id", fieldId);
      if (error) {
        toast.error(error.message);
        return;
      }
      if (field) {
        const updates = records.map((r) => {
          const newValues = { ...r.values };
          delete newValues[field.field_key];
          return supabase
            .from("collection_records")
            .update({ values: newValues })
            .eq("id", r.id);
        });
        await Promise.all(updates);
      }
      toast.success("Field deleted");
      fetchFields();
      fetchRecords();
    },
    [supabase, fields, records, fetchFields, fetchRecords],
  );

  const reorderFields = useCallback(
    async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, i) =>
        supabase.from("collection_fields").update({ sort_order: i }).eq("id", id),
      );
      await Promise.all(updates);
      fetchFields();
    },
    [supabase, fetchFields],
  );

  // ── View CRUD ─────────────────────────────────────────────────

  const createView = useCallback(
    async (input: { name: string; view_type: CollectionViewType; config?: ViewConfig }) => {
      const maxSort = views.reduce((m, v) => Math.max(m, v.sort_order), -1);
      const { data, error } = await supabase
        .from("collection_views")
        .insert({
          collection_id: collectionId,
          name: input.name,
          view_type: input.view_type,
          config: input.config ?? {},
          is_default: views.length === 0,
          sort_order: maxSort + 1,
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`View "${input.name}" created`);
      fetchViews();
      if (data) setActiveViewId(data.id);
    },
    [supabase, collectionId, views, fetchViews, setActiveViewId],
  );

  const updateView = useCallback(
    async (viewId: string, updates: Partial<Pick<CollectionView, "name" | "config" | "is_default">>) => {
      if (updates.is_default) {
        await supabase
          .from("collection_views")
          .update({ is_default: false })
          .eq("collection_id", collectionId)
          .neq("id", viewId);
      }
      const { error } = await supabase
        .from("collection_views")
        .update(updates)
        .eq("id", viewId);
      if (error) {
        toast.error(error.message);
        return;
      }
      fetchViews();
    },
    [supabase, collectionId, fetchViews],
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) {
        toast.error("Cannot delete the last view");
        return;
      }
      const view = views.find((v) => v.id === viewId);
      if (view?.is_default) {
        toast.error("Set another view as default first");
        return;
      }
      const { error } = await supabase
        .from("collection_views")
        .delete()
        .eq("id", viewId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("View deleted");
      fetchViews();
      if (activeViewId === viewId) {
        setActiveViewId(null);
      }
    },
    [supabase, views, activeViewId, fetchViews, setActiveViewId],
  );

  // ── Import ────────────────────────────────────────────────────

  const importRecords = useCallback(
    async (rows: Record<string, unknown>[]): Promise<number> => {
      if (!rows.length) return 0;

      const inserts = rows.map((values) => ({
        collection_id: collectionId,
        values,
      }));

      const { data, error } = await supabase
        .from("collection_records")
        .insert(inserts)
        .select("id");

      if (error) {
        toast.error(error.message);
        return 0;
      }

      const count = data?.length ?? 0;
      toast.success(`Imported ${count} records`);
      fetchRecords();
      return count;
    },
    [supabase, collectionId, fetchRecords],
  );

  // ── Filtered records ──────────────────────────────────────────

  const titleField = useMemo(
    () => fields.find((f) => f.is_title_field) ?? fields[0],
    [fields],
  );

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r) => {
      const vals = Object.values(r.values);
      return vals.some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      );
    });
  }, [records, search]);

  return {
    records: filtered,
    allRecords: records,
    fields,
    views,
    activeView,
    titleField,
    loading,
    filters: {
      search,
      setSearch,
      showArchived,
      setShowArchived,
      activeViewId,
      setActiveViewId,
    },
    actions: {
      createRecord,
      updateRecord,
      updateCell,
      archiveRecord,
      deleteRecord,
      addField,
      updateField,
      deleteField,
      reorderFields,
      createView,
      updateView,
      deleteView,
      importRecords,
    },
  };
}
