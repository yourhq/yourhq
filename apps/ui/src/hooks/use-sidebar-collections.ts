"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CollectionTemplate } from "@/lib/collections/types";
import { logAudit } from "@/lib/audit/log";
import { toast } from "sonner";
import { useRealtime } from "./use-realtime";

interface SidebarCollection {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

const PINNED_KEY = "sidebar-pinned-collections";
const EXPANDED_KEY = "sidebar-collections-expanded";

function readPinned(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistPinned(ids: Set<string>) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]));
  } catch {}
}

function readExpanded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(EXPANDED_KEY) !== "false";
  } catch {
    return true;
  }
}

export function useSidebarCollections() {
  const supabase = useMemo(() => createClient(), []);
  const [collections, setCollections] = useState<SidebarCollection[]>([]);
  const [templates, setTemplates] = useState<CollectionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(readPinned);
  const [expanded, setExpanded] = useState(readExpanded);
  const [showCreate, setShowCreate] = useState(false);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("collection_definitions")
      .select("id, name, slug, icon, color")
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    setCollections(data ?? []);
    setLoading(false);
  }, [supabase]);

  const fetchTemplates = useCallback(async () => {
    const { data } = await supabase
      .from("collection_templates")
      .select("*")
      .order("sort_order", { ascending: true });
    setTemplates(data ?? []);
  }, [supabase]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch();
    fetchTemplates();
  }, [fetch, fetchTemplates]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "collection_definitions",
    onPayload: () => {
      fetch();
    },
  });

  const createCollection = useCallback(
    async (input: { name: string; slug: string; description?: string }) => {
      const { data, error } = await supabase
        .from("collection_definitions")
        .insert({
          name: input.name,
          slug: input.slug,
          description: input.description || null,
          icon: null,
          color: "#6b7280",
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

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
      fetch();
    },
    [supabase, fetch],
  );

  const installTemplate = useCallback(
    async (template: CollectionTemplate) => {
      const slug = template.slug;
      const { data: existing } = await supabase
        .from("collection_definitions")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      let finalSlug = slug;
      if (existing) {
        let counter = 2;
        // eslint-disable-next-line no-constant-condition
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
        return;
      }

      const def = template.definition;

      if (def.fields?.length) {
        const fieldRows = def.fields.map((f: Record<string, unknown>, i: number) => ({
          collection_id: col.id,
          field_key: f.field_key,
          field_type: f.field_type,
          label: f.label,
          sort_order: (f.sort_order as number) ?? i,
          required: (f.required as boolean) ?? false,
          options: f.options ?? null,
          default_value: f.default_value ?? null,
          is_title_field: (f.is_title_field as boolean) ?? false,
        }));
        await supabase.from("collection_fields").insert(fieldRows);
      }

      if (def.views?.length) {
        const viewRows = def.views.map((v: Record<string, unknown>, i: number) => ({
          collection_id: col.id,
          name: v.name,
          view_type: v.view_type,
          config: v.config ?? {},
          is_default: (v.is_default as boolean) ?? i === 0,
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
      fetch();
    },
    [supabase, fetch],
  );

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistPinned(next);
      return next;
    });
  }, []);

  const setExpandedPersist = useCallback((value: boolean) => {
    setExpanded(value);
    try {
      localStorage.setItem(EXPANDED_KEY, String(value));
    } catch {}
  }, []);

  const pinned = useMemo(
    () => collections.filter((c) => pinnedIds.has(c.id)),
    [collections, pinnedIds],
  );

  const unpinned = useMemo(
    () => collections.filter((c) => !pinnedIds.has(c.id)),
    [collections, pinnedIds],
  );

  return {
    collections,
    pinned,
    unpinned,
    pinnedIds,
    togglePin,
    expanded,
    setExpanded: setExpandedPersist,
    loading,
    templates,
    createCollection,
    installTemplate,
    showCreate,
    openCreate: useCallback(() => setShowCreate(true), []),
    closeCreate: useCallback(() => setShowCreate(false), []),
  };
}
