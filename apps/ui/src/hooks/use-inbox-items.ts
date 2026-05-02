"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InboxItem, InboxItemStatus } from "@/lib/inbox/types";
import { useRealtime } from "./use-realtime";

const PAGE_SIZE = 20;
const ITEM_SELECT = "*, agent:agents!agent_inbox_items_agent_id_fkey(id, name, slug), contact:contacts!agent_inbox_items_contact_id_fkey(id, name, handle)";

interface UseInboxItemsOptions {
  agentId?: string;
  contactId?: string;
}

export function useInboxItems({ agentId, contactId }: UseInboxItemsOptions = {}) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InboxItemStatus | "all">("all");

  const supabase = useMemo(() => createClient(), []);

  const fetchItems = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);

    let query = supabase
      .from("agent_inbox_items")
      .select(ITEM_SELECT)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (agentId) query = query.eq("agent_id", agentId);
    if (contactId) query = query.eq("contact_id", contactId);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (!error && data) {
      const typed = data as unknown as InboxItem[];
      if (offset === 0) {
        setItems(typed);
      } else {
        setItems((prev) => [...prev, ...typed]);
      }
      setHasMore(typed.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [supabase, agentId, contactId, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems(0);
  }, [fetchItems]);

  useRealtime({
    table: "agent_inbox_items",
    ...(agentId ? { filter: `agent_id=eq.${agentId}` } : {}),
    onPayload: () => {
      fetchItems(0);
    },
  });

  // Also subscribe for contact filter if no agent filter
  useRealtime({
    table: "agent_inbox_items",
    ...(contactId ? { filter: `contact_id=eq.${contactId}` } : {}),
    enabled: !!contactId && !agentId,
    onPayload: () => {
      fetchItems(0);
    },
  });

  function loadMore() {
    fetchItems(items.length);
  }

  // Compute counts from all fetched items (approximate — based on loaded data)
  const counts = useMemo(() => {
    const c = { pending: 0, leased: 0, done: 0, failed: 0, dead_letter: 0 };
    for (const item of items) {
      if (item.status in c) c[item.status as keyof typeof c]++;
    }
    return c;
  }, [items]);

  return {
    items,
    loading,
    hasMore,
    loadMore,
    statusFilter,
    setStatusFilter,
    counts,
  };
}
