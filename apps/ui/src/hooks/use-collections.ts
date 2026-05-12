"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CollectionDefinition, CollectionTemplate } from "@/lib/collections/types";
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

export function useCollections() {
  const searchParams = useSearchParams();
  const [collections, setCollections] = useState<CollectionDefinition[]>([]);
  const [templates, setTemplates] = useState<CollectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const [search, setSearchState] = useState(searchParams.get("q") ?? "");
  const [showArchived, setShowArchivedState] = useState(
    searchParams.get("archived") === "1",
  );

  function setSearch(v: string) {
    setSearchState(v);
    updateUrl({ q: v || null });
  }

  function setShowArchived(v: boolean) {
    setShowArchivedState(v);
    updateUrl({ archived: v ? "1" : null });
  }

  const fetchCollections = useCallback(async () => {
    let q = supabase
      .from("collection_definitions")
      .select("*, collection_records(count)")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (!showArchived) {
      q = q.is("archived_at", null);
    }

    const { data, error } = await q;
    if (error) {
      console.error("Failed to fetch collections:", error);
      return;
    }
    const mapped = (data ?? []).map((d) => {
      const raw = d as typeof d & { collection_records?: { count: number }[] };
      const count = raw.collection_records?.[0]?.count ?? 0;
      const { collection_records: _, ...rest } = raw;
      return { ...rest, record_count: count } as CollectionDefinition;
    });
    setCollections(mapped);
    setLoading(false);
  }, [supabase, showArchived]);

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("collection_templates")
      .select("*")
      .order("sort_order", { ascending: true });
    setTemplates(data ?? []);
  }, [supabase]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchCollections();
    fetchTemplates();
  }, [fetchCollections, fetchTemplates]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "collection_definitions",
    onPayload: () => fetchCollections(),
  });

  const createCollection = useCallback(
    async (input: {
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      color?: string;
    }): Promise<CollectionDefinition | null> => {
      const { data, error } = await supabase
        .from("collection_definitions")
        .insert({
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          icon: input.icon || null,
          color: input.color || "#6b7280",
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return null;
      }

      // Seed with a default title field and table view
      await supabase.from("collection_fields").insert({
        collection_id: data.id,
        field_key: "name",
        field_type: "text",
        label: "Name",
        sort_order: 0,
        required: false,
        is_title_field: true,
      });

      await supabase.from("collection_views").insert({
        collection_id: data.id,
        name: "All Records",
        view_type: "table",
        config: {},
        is_default: true,
        sort_order: 0,
      });

      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection",
        entity_id: data.id,
        action: "created",
        summary: `Created collection '${input.name}'`,
      });

      toast.success("Collection created");
      fetchCollections();
      return data;
    },
    [supabase, fetchCollections],
  );

  const installTemplate = useCallback(
    async (template: CollectionTemplate): Promise<CollectionDefinition | null> => {
      const slug = template.slug;
      const { data: existing } = await supabase
        .from("collection_definitions")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      let finalSlug = slug;
      if (existing) {
        let counter = 2;
        while (true) {
          const candidate = `${slug}-${counter}`;
          const { data: check } = await supabase
            .from("collection_definitions")
            .select("id")
            .eq("slug", candidate)
            .maybeSingle();
          if (!check) {
            finalSlug = candidate;
            break;
          }
          counter++;
        }
      }

      const { data: col, error: colErr } = await supabase
        .from("collection_definitions")
        .insert({
          name: template.name,
          slug: finalSlug,
          description: template.description || null,
          icon: template.icon || null,
        })
        .select()
        .single();

      if (colErr || !col) {
        toast.error(colErr?.message ?? "Failed to create collection");
        return null;
      }

      const def = template.definition;

      if (def.fields?.length) {
        const fieldRows = def.fields.map((f, i) => ({
          collection_id: col.id,
          field_key: f.field_key,
          field_type: f.field_type,
          label: f.label,
          sort_order: f.sort_order ?? i,
          required: f.required ?? false,
          options: f.options ?? null,
          default_value: f.default_value ?? null,
          is_title_field: f.is_title_field ?? false,
        }));
        await supabase.from("collection_fields").insert(fieldRows);
      }

      if (def.views?.length) {
        const viewRows = def.views.map((v, i) => ({
          collection_id: col.id,
          name: v.name,
          view_type: v.view_type,
          config: v.config ?? {},
          is_default: v.is_default ?? i === 0,
          sort_order: i,
        }));
        await supabase.from("collection_views").insert(viewRows);
      }

      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection",
        entity_id: col.id,
        action: "created",
        summary: `Installed collection '${template.name}' from template`,
      });

      toast.success(`Installed "${template.name}"`);
      fetchCollections();
      return col;
    },
    [supabase, fetchCollections],
  );

  const archiveCollection = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("collection_definitions")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection",
        entity_id: id,
        action: "archived",
        summary: "Archived collection",
      });
      toast.success("Collection archived");
      fetchCollections();
    },
    [supabase, fetchCollections],
  );

  const restoreCollection = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("collection_definitions")
        .update({ archived_at: null })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection",
        entity_id: id,
        action: "restored",
        summary: "Restored collection",
      });
      toast.success("Collection restored");
      fetchCollections();
    },
    [supabase, fetchCollections],
  );

  const updateCollection = useCallback(
    async (
      id: string,
      updates: Partial<Pick<CollectionDefinition, "name" | "slug" | "description" | "icon" | "color">>,
    ) => {
      const { error } = await supabase
        .from("collection_definitions")
        .update(updates)
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection",
        entity_id: id,
        action: "updated",
        summary: "Updated collection settings",
      });
      toast.success("Collection updated");
      fetchCollections();
    },
    [supabase, fetchCollections],
  );

  const deleteCollection = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("collection_definitions")
        .delete()
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      await logAudit(supabase, {
        module: "collections",
        entity_type: "collection",
        entity_id: id,
        action: "deleted",
        summary: "Deleted collection",
      });
      toast.success("Collection deleted");
      fetchCollections();
    },
    [supabase, fetchCollections],
  );

  const filtered = useMemo(() => {
    if (!search) return collections;
    const q = search.toLowerCase();
    return collections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q),
    );
  }, [collections, search]);

  return {
    collections: filtered,
    allCollections: collections,
    templates,
    loading,
    filters: {
      search,
      setSearch,
      showArchived,
      setShowArchived,
    },
    actions: {
      createCollection,
      updateCollection,
      installTemplate,
      archiveCollection,
      restoreCollection,
      deleteCollection,
    },
    form: {
      showCreate,
      openCreate: () => setShowCreate(true),
      closeCreate: () => setShowCreate(false),
    },
  };
}
