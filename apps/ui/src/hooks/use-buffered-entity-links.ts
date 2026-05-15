"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface BufferedLink {
  localId: string;
  dbId: string | null;
  target_type: TargetType;
  target_id: string | null;
  url: string | null;
  label: string | null;
  resolved_name?: string;
  resolved_icon?: string;
  resolved_extra?: Record<string, unknown>;
  pending: "add" | "remove" | "persisted";
}

let nextLocalId = 0;
function genLocalId() {
  return `local_${++nextLocalId}_${Date.now()}`;
}

export function useBufferedEntityLinks(
  ownerType: OwnerType,
  ownerId: string | null,
) {
  const [buffer, setBuffer] = useState<BufferedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const hydratedRef = useRef<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const hydrate = useCallback(async () => {
    if (!ownerId) return;
    if (hydratedRef.current === ownerId) return;
    hydratedRef.current = ownerId;
    setLoading(true);

    const { data: rows } = await supabase
      .from("entity_links")
      .select("*")
      .eq("owner_type", ownerType)
      .eq("owner_id", ownerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (!rows || rows.length === 0) {
      setLoading(false);
      return;
    }

    const resolved = await resolveNames(supabase, rows);
    setBuffer(
      resolved.map((r) => ({
        localId: genLocalId(),
        dbId: r.id as string | null,
        target_type: r.target_type as TargetType,
        target_id: (r.target_id as string | null) ?? null,
        url: (r.url as string | null) ?? null,
        label: (r.label as string | null) ?? null,
        resolved_name: r.resolved_name,
        resolved_icon: r.resolved_icon,
        resolved_extra: r.resolved_extra,
        pending: "persisted" as const,
      })),
    );
    setLoading(false);
  }, [supabase, ownerType, ownerId]);

  useEffect(() => {
    if (ownerId) hydrate();
  }, [ownerId, hydrate]);

  function addLink(input: AddLinkInput) {
    const newLink: BufferedLink = {
      localId: genLocalId(),
      dbId: null,
      target_type: input.target_type,
      target_id: input.target_id ?? null,
      url: input.url ?? null,
      label: input.label ?? null,
      resolved_name: input.label ?? undefined,
      pending: "add",
    };
    setBuffer((prev) => [...prev, newLink]);
  }

  function removeLink(localId: string) {
    setBuffer((prev) =>
      prev.map((l) => {
        if (l.localId !== localId) return l;
        if (l.pending === "add") return { ...l, pending: "remove" as const };
        return { ...l, pending: "remove" as const };
      }),
    );
  }

  const links: EntityLink[] = buffer
    .filter((l) => l.pending !== "remove")
    .map((l) => ({
      id: l.localId,
      created_at: "",
      owner_type: ownerType,
      owner_id: ownerId ?? "",
      target_type: l.target_type,
      target_id: l.target_id,
      url: l.url,
      label: l.label,
      sort_order: 0,
      meta: {},
      is_deliverable: false,
      review_status: null,
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
      submitted_by_agent_id: null,
      resolved_name: l.resolved_name,
      resolved_icon: l.resolved_icon,
      resolved_extra: l.resolved_extra,
    }));

  async function flush(resolvedOwnerId: string): Promise<void> {
    const toInsert = buffer.filter(
      (l) => l.pending === "add",
    );
    const toDelete = buffer.filter(
      (l) => l.pending === "remove" && l.dbId,
    );

    const inserts = toInsert.map((l) => ({
      owner_type: ownerType,
      owner_id: resolvedOwnerId,
      target_type: l.target_type,
      target_id: l.target_id,
      url: l.url,
      label: l.label,
    }));

    if (inserts.length > 0) {
      const { error } = await supabase.from("entity_links").insert(inserts);
      if (!error) {
        for (const l of toInsert) {
          logAudit(supabase, {
            module: ownerType === "task" ? "tasks" : "routines",
            entity_type: "entity_link",
            entity_id: resolvedOwnerId,
            action: "created",
            summary: `Linked ${l.target_type} to ${ownerType}`,
          });
        }
      }
    }

    for (const l of toDelete) {
      await supabase.from("entity_links").delete().eq("id", l.dbId!);
      logAudit(supabase, {
        module: ownerType === "task" ? "tasks" : "routines",
        entity_type: "entity_link",
        entity_id: l.dbId!,
        action: "deleted",
        summary: `Removed link from ${ownerType}`,
      });
    }
  }

  async function searchTargets(
    query: string,
    targetTypes?: TargetType[],
  ): Promise<EntityLinkSearchResult[]> {
    if (!query.trim()) return [];
    const q = `%${query.trim()}%`;
    const types = targetTypes ?? [
      "knowledge_item",
      "contact",
      "organization",
      "task",
      "collection_record",
    ];
    const results: EntityLinkSearchResult[] = [];
    const searches: PromiseLike<void>[] = [];

    if (types.includes("knowledge_item")) {
      searches.push(
        supabase
          .from("knowledge_items")
          .select("id, title, kind, icon")
          .ilike("title", q)
          .is("archived_at", null)
          .limit(5)
          .then(({ data }) => {
            (data ?? []).forEach(
              (k: { id: string; title: string; kind: string; icon: string | null }) =>
                results.push({
                  id: k.id,
                  name: k.title,
                  target_type: "knowledge_item",
                  icon: k.icon ?? undefined,
                  extra: { kind: k.kind },
                }),
            );
          }),
      );
    }

    if (types.includes("contact")) {
      searches.push(
        supabase
          .from("contacts")
          .select("id, name")
          .ilike("name", q)
          .is("archived_at", null)
          .limit(5)
          .then(({ data }) => {
            (data ?? []).forEach((c: { id: string; name: string }) =>
              results.push({ id: c.id, name: c.name, target_type: "contact" }),
            );
          }),
      );
    }

    if (types.includes("organization")) {
      searches.push(
        supabase
          .from("organizations")
          .select("id, name")
          .ilike("name", q)
          .limit(5)
          .then(({ data }) => {
            (data ?? []).forEach((o: { id: string; name: string }) =>
              results.push({
                id: o.id,
                name: o.name,
                target_type: "organization",
              }),
            );
          }),
      );
    }

    if (types.includes("task")) {
      searches.push(
        supabase
          .from("tasks")
          .select("id, title")
          .ilike("title", q)
          .limit(5)
          .then(({ data }) => {
            (data ?? []).forEach((t: { id: string; title: string }) =>
              results.push({ id: t.id, name: t.title, target_type: "task" }),
            );
          }),
      );
    }

    await Promise.all(searches);
    return results;
  }

  const dirty = buffer.some((l) => l.pending === "add" || l.pending === "remove");

  return {
    links,
    loading,
    dirty,
    actions: { addLink, removeLink, searchTargets, flush },
  };
}

async function resolveNames(
  supabase: ReturnType<typeof createClient>,
  rows: Record<string, unknown>[],
) {
  const knowledgeIds = rows
    .filter((r) => r.target_type === "knowledge_item" && r.target_id)
    .map((r) => r.target_id as string);
  const contactIds = rows
    .filter((r) => r.target_type === "contact" && r.target_id)
    .map((r) => r.target_id as string);
  const orgIds = rows
    .filter((r) => r.target_type === "organization" && r.target_id)
    .map((r) => r.target_id as string);
  const taskIds = rows
    .filter((r) => r.target_type === "task" && r.target_id)
    .map((r) => r.target_id as string);
  const recordIds = rows
    .filter((r) => r.target_type === "collection_record" && r.target_id)
    .map((r) => r.target_id as string);

  type IdRow = { id: string; [k: string]: unknown };

  const [kr, cr, or, tr, rr] = await Promise.all([
    knowledgeIds.length > 0
      ? supabase.from("knowledge_items").select("id, title, kind, icon").in("id", knowledgeIds)
      : Promise.resolve({ data: [] as IdRow[] }),
    contactIds.length > 0
      ? supabase.from("contacts").select("id, name").in("id", contactIds)
      : Promise.resolve({ data: [] as IdRow[] }),
    orgIds.length > 0
      ? supabase.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] as IdRow[] }),
    taskIds.length > 0
      ? supabase.from("tasks").select("id, title").in("id", taskIds)
      : Promise.resolve({ data: [] as IdRow[] }),
    recordIds.length > 0
      ? supabase.from("collection_records").select("id, values").in("id", recordIds)
      : Promise.resolve({ data: [] as IdRow[] }),
  ]);

  const km = new Map((kr.data ?? []).map((k: IdRow) => [k.id, k]));
  const cm = new Map((cr.data ?? []).map((c: IdRow) => [c.id, c]));
  const om = new Map((or.data ?? []).map((o: IdRow) => [o.id, o]));
  const tm = new Map((tr.data ?? []).map((t: IdRow) => [t.id, t]));
  const rm = new Map((rr.data ?? []).map((r: IdRow) => [r.id, r]));

  return rows.map((row) => {
    const out: Record<string, unknown> & {
      resolved_name?: string;
      resolved_icon?: string;
      resolved_extra?: Record<string, unknown>;
    } = { ...row };

    const tid = row.target_id as string | null;
    if (!tid) return out;

    switch (row.target_type) {
      case "knowledge_item": {
        const item = km.get(tid);
        if (item) {
          out.resolved_name = item.title as string;
          out.resolved_icon = (item.icon as string) ?? undefined;
          out.resolved_extra = { kind: item.kind };
        }
        break;
      }
      case "contact": {
        const c = cm.get(tid);
        if (c) out.resolved_name = c.name as string;
        break;
      }
      case "organization": {
        const o = om.get(tid);
        if (o) out.resolved_name = o.name as string;
        break;
      }
      case "task": {
        const t = tm.get(tid);
        if (t) out.resolved_name = t.title as string;
        break;
      }
      case "collection_record": {
        const r = rm.get(tid);
        if (r) {
          const vals = r.values as Record<string, unknown>;
          out.resolved_name =
            (vals?.name as string) ?? (vals?.title as string) ?? "Record";
        }
        break;
      }
    }
    return out;
  });
}
