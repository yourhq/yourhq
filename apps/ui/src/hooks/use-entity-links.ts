"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  EntityLink,
  EntityLinkSearchResult,
  OwnerType,
  TargetType,
} from "@/lib/entity-links/types";
import { logAudit } from "@/lib/audit/log";

interface AddLinkInput {
  target_type: TargetType;
  target_id?: string;
  url?: string;
  label?: string;
}

export function useEntityLinks(ownerType: OwnerType, ownerId: string) {
  const [links, setLinks] = useState<EntityLink[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchLinks = useCallback(async () => {
    setLoading(true);

    const { data: rows, error } = await supabase
      .from("entity_links")
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !rows) {
      setLoading(false);
      return;
    }

    const docIds = rows
      .filter((r) => r.target_type === "document" && r.target_id)
      .map((r) => r.target_id!);
    const assetIds = rows
      .filter((r) => r.target_type === "asset" && r.target_id)
      .map((r) => r.target_id!);
    const contactIds = rows
      .filter((r) => r.target_type === "contact" && r.target_id)
      .map((r) => r.target_id!);
    const orgIds = rows
      .filter((r) => r.target_type === "organization" && r.target_id)
      .map((r) => r.target_id!);
    const taskIds = rows
      .filter((r) => r.target_type === "task" && r.target_id)
      .map((r) => r.target_id!);

    const [docsResult, assetsResult, contactsResult, orgsResult, tasksResult] =
      await Promise.all([
        docIds.length > 0
          ? supabase.from("documents").select("id, title, icon").in("id", docIds)
          : Promise.resolve({ data: [] }),
        assetIds.length > 0
          ? supabase.from("assets").select("id, name, type").in("id", assetIds)
          : Promise.resolve({ data: [] }),
        contactIds.length > 0
          ? supabase
              .from("contacts")
              .select("id, first_name, last_name")
              .in("id", contactIds)
          : Promise.resolve({ data: [] }),
        orgIds.length > 0
          ? supabase
              .from("organizations")
              .select("id, name")
              .in("id", orgIds)
          : Promise.resolve({ data: [] }),
        taskIds.length > 0
          ? supabase.from("tasks").select("id, title").in("id", taskIds)
          : Promise.resolve({ data: [] }),
      ]);

    type IdName = { id: string; [k: string]: unknown };
    const docMap = new Map(
      (docsResult.data ?? []).map((d: IdName) => [d.id, d])
    );
    const assetMap = new Map(
      (assetsResult.data ?? []).map((a: IdName) => [a.id, a])
    );
    const contactMap = new Map(
      (contactsResult.data ?? []).map((c: IdName) => [c.id, c])
    );
    const orgMap = new Map(
      (orgsResult.data ?? []).map((o: IdName) => [o.id, o])
    );
    const taskMap = new Map(
      (tasksResult.data ?? []).map((t: IdName) => [t.id, t])
    );

    const resolved: EntityLink[] = rows.map((row) => {
      const link: EntityLink = row as EntityLink;
      if (!row.target_id) return link;

      switch (row.target_type) {
        case "document": {
          const doc = docMap.get(row.target_id);
          if (doc) {
            link.resolved_name = doc.title as string;
            link.resolved_icon = (doc.icon as string) ?? undefined;
          }
          break;
        }
        case "asset": {
          const asset = assetMap.get(row.target_id);
          if (asset) {
            link.resolved_name = asset.name as string;
            link.resolved_extra = { asset_type: asset.type };
          }
          break;
        }
        case "contact": {
          const contact = contactMap.get(row.target_id);
          if (contact) {
            link.resolved_name = [contact.first_name, contact.last_name]
              .filter(Boolean)
              .join(" ");
          }
          break;
        }
        case "organization": {
          const org = orgMap.get(row.target_id);
          if (org) link.resolved_name = org.name as string;
          break;
        }
        case "task": {
          const task = taskMap.get(row.target_id);
          if (task) link.resolved_name = task.title as string;
          break;
        }
      }
      return link;
    });

    setLinks(resolved);
    setLoading(false);
  }, [supabase, ownerType, ownerId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  async function addLink(input: AddLinkInput) {
    const payload: Record<string, unknown> = {
      owner_type: ownerType,
      owner_id: ownerId,
      target_type: input.target_type,
      target_id: input.target_id ?? null,
      url: input.url ?? null,
      label: input.label ?? null,
    };

    const { data: inserted, error } = await supabase
      .from("entity_links")
      .insert(payload)
      .select("id")
      .single();

    if (!error && inserted) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "entity_link",
        entity_id: inserted.id,
        action: "created",
        summary: `Linked ${input.target_type} to ${ownerType}`,
      });
      fetchLinks();
    }
    return { error };
  }

  async function removeLink(linkId: string) {
    await supabase.from("entity_links").delete().eq("id", linkId);
    logAudit(supabase, {
      module: "tasks",
      entity_type: "entity_link",
      entity_id: linkId,
      action: "deleted",
      summary: `Removed link from ${ownerType}`,
    });
    fetchLinks();
  }

  async function searchTargets(
    query: string,
    targetTypes?: TargetType[]
  ): Promise<EntityLinkSearchResult[]> {
    if (!query.trim()) return [];
    const q = `%${query.trim()}%`;
    const types = targetTypes ?? [
      "document",
      "asset",
      "contact",
      "organization",
      "task",
    ];
    const results: EntityLinkSearchResult[] = [];

    const searches = [];

    if (types.includes("document")) {
      searches.push(
        supabase
          .from("documents")
          .select("id, title, icon")
          .ilike("title", q)
          .limit(5)
          .then(({ data }) =>
            (data ?? []).forEach((d: { id: string; title: string; icon: string | null }) =>
              results.push({
                id: d.id,
                name: d.title,
                target_type: "document",
                icon: d.icon ?? undefined,
              })
            )
          )
      );
    }

    if (types.includes("asset")) {
      searches.push(
        supabase
          .from("assets")
          .select("id, name, type")
          .ilike("name", q)
          .limit(5)
          .then(({ data }) =>
            (data ?? []).forEach((a: { id: string; name: string; type: string }) =>
              results.push({
                id: a.id,
                name: a.name,
                target_type: "asset",
                extra: { asset_type: a.type },
              })
            )
          )
      );
    }

    if (types.includes("contact")) {
      searches.push(
        supabase
          .from("contacts")
          .select("id, first_name, last_name")
          .or(`first_name.ilike.${q},last_name.ilike.${q}`)
          .limit(5)
          .then(({ data }) =>
            (data ?? []).forEach(
              (c: { id: string; first_name: string; last_name: string }) =>
                results.push({
                  id: c.id,
                  name: [c.first_name, c.last_name].filter(Boolean).join(" "),
                  target_type: "contact",
                })
            )
          )
      );
    }

    if (types.includes("organization")) {
      searches.push(
        supabase
          .from("organizations")
          .select("id, name")
          .ilike("name", q)
          .limit(5)
          .then(({ data }) =>
            (data ?? []).forEach((o: { id: string; name: string }) =>
              results.push({
                id: o.id,
                name: o.name,
                target_type: "organization",
              })
            )
          )
      );
    }

    if (types.includes("task")) {
      searches.push(
        supabase
          .from("tasks")
          .select("id, title")
          .ilike("title", q)
          .limit(5)
          .then(({ data }) =>
            (data ?? []).forEach((t: { id: string; title: string }) =>
              results.push({
                id: t.id,
                name: t.title,
                target_type: "task",
              })
            )
          )
      );
    }

    await Promise.all(searches);
    return results;
  }

  async function reorderLinks(orderedIds: string[]) {
    const updates = orderedIds.map((id, i) =>
      supabase.from("entity_links").update({ sort_order: i }).eq("id", id)
    );
    await Promise.all(updates);
    fetchLinks();
  }

  return {
    links,
    loading,
    actions: {
      addLink,
      removeLink,
      searchTargets,
      reorderLinks,
      fetchLinks,
    },
  };
}
