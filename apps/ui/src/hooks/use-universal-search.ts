"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SearchResultType =
  | "knowledge"
  | "knowledge_chunk"
  | "task"
  | "contact"
  | "collection_record"
  | "agent"
  | "routine";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  snippet?: string;
  href: string;
  icon?: string;
  color?: string;
  score?: number;
}

interface SearchGroup {
  type: SearchResultType;
  label: string;
  results: SearchResult[];
  loading: boolean;
}

const DEBOUNCE_MS = 200;
const MAX_PER_GROUP = 5;

export function useUniversalSearch(query: string, enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback(
    async (q: string) => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const trimmed = q.trim();
      if (!trimmed) {
        setGroups([]);
        setSearching(false);
        return;
      }

      setSearching(true);

      const pending: SearchGroup[] = [
        { type: "knowledge", label: "Knowledge", results: [], loading: true },
        { type: "knowledge_chunk", label: "Passages", results: [], loading: true },
        { type: "task", label: "Tasks", results: [], loading: true },
        { type: "collection_record", label: "Collection Records", results: [], loading: true },
        { type: "contact", label: "Contacts", results: [], loading: true },
        { type: "agent", label: "Agents", results: [], loading: true },
        { type: "routine", label: "Routines", results: [], loading: true },
      ];
      setGroups(pending);

      const update = (type: SearchResultType, results: SearchResult[]) => {
        if (ac.signal.aborted) return;
        setGroups((prev) =>
          prev.map((g) =>
            g.type === type ? { ...g, results, loading: false } : g,
          ),
        );
      };

      const pattern = `%${trimmed}%`;

      // Fan out all queries in parallel using async IIFEs
      (async () => {
        try {
          const { data } = await supabase.rpc("search_knowledge_items_text", {
            query_text: trimmed,
            match_count: MAX_PER_GROUP,
          });
          if (ac.signal.aborted) return;
          update(
            "knowledge",
            (data ?? []).map(
              (r: { id: string; title: string; kind: string; similarity?: number }) => ({
                id: r.id,
                type: "knowledge" as const,
                title: r.title,
                subtitle: r.kind,
                href: `/dashboard/knowledge/${r.id}`,
                score: r.similarity,
              }),
            ),
          );
        } catch {
          update("knowledge", []);
        }
      })();

      (async () => {
        try {
          const { data } = await supabase
            .from("knowledge_chunks")
            .select("id, knowledge_item_id, chunk_index, content")
            .textSearch("content", trimmed, { type: "plain" })
            .limit(MAX_PER_GROUP);
          if (ac.signal.aborted) return;
          update(
            "knowledge_chunk",
            (data ?? []).map(
              (r: { id: string; content: string; knowledge_item_id: string | null }) => ({
                id: r.id,
                type: "knowledge_chunk" as const,
                title: "Knowledge passage",
                snippet: (r.content ?? "").slice(0, 160),
                href: r.knowledge_item_id
                  ? `/dashboard/knowledge/${r.knowledge_item_id}`
                  : "#",
              }),
            ),
          );
        } catch {
          update("knowledge_chunk", []);
        }
      })();

      (async () => {
        try {
          const { data } = await supabase
            .from("tasks")
            .select("id, title, status, priority")
            .or(`title.ilike.${pattern},description.ilike.${pattern}`)
            .is("archived_at", null)
            .order("updated_at", { ascending: false })
            .limit(MAX_PER_GROUP);
          if (ac.signal.aborted) return;
          update(
            "task",
            (data ?? []).map((r) => ({
              id: r.id,
              type: "task" as const,
              title: r.title,
              subtitle: r.status,
              href: `/dashboard/tasks?selected=${r.id}`,
            })),
          );
        } catch {
          update("task", []);
        }
      })();

      (async () => {
        try {
          const { data } = await supabase
            .from("collection_records")
            .select("id, collection_id, values, collection:collection_definitions!collection_records_collection_id_fkey(name, slug, icon, color)")
            .is("archived_at", null)
            .textSearch("values", trimmed, { type: "plain" })
            .order("updated_at", { ascending: false })
            .limit(MAX_PER_GROUP);
          if (ac.signal.aborted) return;
          update(
            "collection_record",
            (data ?? []).map((r: Record<string, unknown>) => {
              const col = r.collection as { name: string; slug: string; icon?: string; color?: string } | null;
              const vals = r.values as Record<string, unknown>;
              const titleVal = Object.values(vals).find((v) => typeof v === "string" && v.length > 0) as string | undefined;
              return {
                id: r.id as string,
                type: "collection_record" as const,
                title: titleVal ?? "Untitled",
                subtitle: col?.name,
                href: `/dashboard/collections/${col?.slug ?? "unknown"}/${r.id}`,
                icon: col?.icon ?? undefined,
                color: col?.color ?? undefined,
              };
            }),
          );
        } catch {
          update("collection_record", []);
        }
      })();

      (async () => {
        try {
          const { data } = await supabase
            .from("contacts")
            .select("id, full_name, email, company")
            .or(`full_name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern}`)
            .is("archived_at", null)
            .order("updated_at", { ascending: false })
            .limit(MAX_PER_GROUP);
          if (ac.signal.aborted) return;
          update(
            "contact",
            (data ?? []).map((r) => ({
              id: r.id,
              type: "contact" as const,
              title: r.full_name || r.email || "Unknown",
              subtitle: r.company ?? undefined,
              href: `/dashboard/crm/${r.id}`,
            })),
          );
        } catch {
          update("contact", []);
        }
      })();

      (async () => {
        try {
          const { data } = await supabase
            .from("agents")
            .select("id, name, slug, meta")
            .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
            .order("name", { ascending: true })
            .limit(MAX_PER_GROUP);
          if (ac.signal.aborted) return;
          update(
            "agent",
            (data ?? []).map((r) => ({
              id: r.id,
              type: "agent" as const,
              title: r.name,
              icon: (r.meta as { emoji?: string } | null)?.emoji ?? undefined,
              href: `/dashboard/agents/${r.slug}`,
            })),
          );
        } catch {
          update("agent", []);
        }
      })();

      (async () => {
        try {
          const { data } = await supabase
            .from("routines")
            .select("id, name, trigger_type, agent_slug")
            .ilike("name", pattern)
            .is("archived_at", null)
            .order("updated_at", { ascending: false })
            .limit(MAX_PER_GROUP);
          if (ac.signal.aborted) return;
          update(
            "routine",
            (data ?? []).map((r) => ({
              id: r.id,
              type: "routine" as const,
              title: r.name,
              subtitle: r.trigger_type,
              href: `/dashboard/routines?selected=${r.id}`,
            })),
          );
        } catch {
          update("routine", []);
        }
      })();

      // Semantic search — best-effort, may fail if embedder is unreachable
      (async () => {
        try {
          const res = await fetch("/api/embed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: trimmed }),
            signal: ac.signal,
          });
          if (!res.ok) return;
          const embedData = await res.json();
          if (!embedData?.embedding || ac.signal.aborted) return;

          const { data: semanticData } = await supabase.rpc("search_knowledge_items", {
            query_embedding: JSON.stringify(embedData.embedding),
            match_count: MAX_PER_GROUP,
          });
          if (!semanticData || ac.signal.aborted) return;

          setGroups((prev) => {
            const existing = prev.find((g) => g.type === "knowledge");
            if (!existing) return prev;
            const existingIds = new Set(existing.results.map((r) => r.id));
            const semanticOnly = (semanticData as { id: string; title: string; kind: string; similarity: number }[])
              .filter((r) => !existingIds.has(r.id))
              .map((r) => ({
                id: r.id,
                type: "knowledge" as const,
                title: r.title,
                subtitle: `${r.kind} · semantic`,
                href: `/dashboard/knowledge/${r.id}`,
                score: r.similarity,
              }));
            if (semanticOnly.length === 0) return prev;
            return prev.map((g) =>
              g.type === "knowledge"
                ? {
                    ...g,
                    results: [...g.results, ...semanticOnly].slice(0, MAX_PER_GROUP + 3),
                  }
                : g,
            );
          });
        } catch {
          // Semantic search is best-effort
        }
      })();

      setSearching(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (!enabled) {
      setGroups([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setGroups([]);
      setSearching(false);
      return;
    }
    timerRef.current = setTimeout(() => search(query), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, enabled, search]);

  const totalResults = useMemo(
    () => groups.reduce((sum, g) => sum + g.results.length, 0),
    [groups],
  );

  const nonEmptyGroups = useMemo(
    () => groups.filter((g) => g.results.length > 0 || g.loading),
    [groups],
  );

  return { groups: nonEmptyGroups, totalResults, searching };
}
