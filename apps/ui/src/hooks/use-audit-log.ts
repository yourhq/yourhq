"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AuditLogEntry } from "@/lib/audit/types";
import { useRealtime } from "./use-realtime";

const PAGE_SIZE = 50;

function useAuditLogCore(opts: {
  entityFilter?: { entity_type: string; entity_id: string };
  moduleFilter: string;
  actorFilter: string;
  actionFilter: string;
}) {
  const { moduleFilter, actorFilter, actionFilter } = opts;
  const entityType = opts.entityFilter?.entity_type;
  const entityId = opts.entityFilter?.entity_id;
  const entityFilter = useMemo(
    () => (entityType && entityId ? { entity_type: entityType, entity_id: entityId } : undefined),
    [entityType, entityId]
  );

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchEntries = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);

    let query = supabase
      .from("audit_log")
      .select("*, actor_agent:agents!audit_log_actor_agent_id_fkey(id, name, slug, avatar_url)")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (entityFilter) {
      query = query
        .eq("entity_type", entityFilter.entity_type)
        .eq("entity_id", entityFilter.entity_id);
    }

    if (moduleFilter !== "all") {
      query = query.eq("module", moduleFilter);
    }
    if (actorFilter === "human") {
      query = query.eq("actor_type", "human");
    } else if (actorFilter === "agent") {
      query = query.eq("actor_type", "agent");
    } else if (actorFilter !== "all") {
      query = query.eq("actor_agent_id", actorFilter);
    }
    if (actionFilter !== "all") {
      query = query.eq("action", actionFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      const typed = data as unknown as AuditLogEntry[];
      if (offset === 0) {
        setEntries(typed);
      } else {
        setEntries((prev) => [...prev, ...typed]);
      }
      setHasMore(typed.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [supabase, moduleFilter, actorFilter, actionFilter, entityFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchEntries(0);
  }, [fetchEntries]);

  useRealtime({
    table: "audit_log",
    event: "INSERT",
    ...(entityFilter
      ? { filter: `entity_type=eq.${entityFilter.entity_type}` }
      : {}),
    onPayload: async (payload) => {
      const newRow = payload.new as Record<string, unknown>;
      const id = newRow.id as string;
      if (!id) return;

      if (entityFilter && newRow.entity_id !== entityFilter.entity_id) return;

      if (moduleFilter !== "all" && newRow.module !== moduleFilter) return;
      if (actionFilter !== "all" && newRow.action !== actionFilter) return;
      if (actorFilter === "human" && newRow.actor_type !== "human") return;
      if (actorFilter === "agent" && newRow.actor_type !== "agent") return;
      if (actorFilter !== "all" && actorFilter !== "human" && actorFilter !== "agent" && newRow.actor_agent_id !== actorFilter) return;

      const { data, error } = await supabase
        .from("audit_log")
        .select("*, actor_agent:agents!audit_log_actor_agent_id_fkey(id, name, slug, avatar_url)")
        .eq("id", id)
        .single();

      if (error || !data) return;
      const entry = data as unknown as AuditLogEntry;

      setEntries((prev) => {
        if (prev.some((e) => e.id === entry.id)) return prev;
        return [entry, ...prev];
      });
    },
  });

  function loadMore() {
    fetchEntries(entries.length);
  }

  return { entries, loading, hasMore, loadMore };
}

/**
 * Entity-scoped audit log — no URL param sync, no Suspense boundary.
 * Use this inside dialogs/modals to avoid flickering.
 */
export function useEntityAuditLog(entityFilter: { entity_type: string; entity_id: string }) {
  return useAuditLogCore({
    entityFilter,
    moduleFilter: "all",
    actorFilter: "all",
    actionFilter: "all",
  });
}

/**
 * Full audit log with URL-synced filters.
 * Only use on standalone pages (not inside dialogs).
 */
export function useAuditLog(entityFilter?: { entity_type: string; entity_id: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [moduleFilter, setModuleFilterState] = useState(searchParams.get("module") || "all");
  const [actorFilter, setActorFilterState] = useState(searchParams.get("actor") || "all");
  const [actionFilter, setActionFilterState] = useState(searchParams.get("action") || "all");

  const updateUrl = useCallback(
    (overrides: Record<string, string | null>) => {
      if (entityFilter) return;
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null || value === "" || value === "all") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname, entityFilter]
  );

  function setModuleFilter(value: string) {
    setModuleFilterState(value);
    updateUrl({ module: value === "all" ? null : value });
  }

  function setActorFilter(value: string) {
    setActorFilterState(value);
    updateUrl({ actor: value === "all" ? null : value });
  }

  function setActionFilter(value: string) {
    setActionFilterState(value);
    updateUrl({ action: value === "all" ? null : value });
  }

  const core = useAuditLogCore({
    entityFilter,
    moduleFilter,
    actorFilter,
    actionFilter,
  });

  return {
    ...core,
    filters: {
      moduleFilter,
      setModuleFilter,
      actorFilter,
      setActorFilter,
      actionFilter,
      setActionFilter,
    },
  };
}
