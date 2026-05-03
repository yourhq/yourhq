"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
  const [loading, setLoading] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(readPinned);
  const [expanded, setExpanded] = useState(readExpanded);

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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetch();
  }, [fetch]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "collection_definitions",
    onPayload: () => {
      fetch();
    },
  });

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
  };
}
