"use client";

import { useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime } from "./use-realtime";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;

interface UseRealtimeSyncOptions<T> {
  /** Supabase table name */
  table: string;
  /** Select query string including JOINs, e.g. "*, campaign:campaigns(id, name)" */
  select: string;
  /**
   * Current items in state. Not read by this hook — the setter is the only thing used —
   * but callers pass it for clarity and to keep TS generic inference stable.
   */
  items?: T[];
  /** State setter */
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  /** Subscribe to specific event types (default: "*") */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Supabase realtime filter (e.g. "parent_id=is.null") */
  filter?: string;
  /** Optional post-processing for a fetched row (e.g., compute attachment_count) */
  postProcess?: (row: T) => Promise<T>;
  /** Only subscribe when enabled (default: true) */
  enabled?: boolean;
}

/**
 * Subscribe to Supabase Realtime changes and sync local state.
 *
 * For INSERT/UPDATE: refetches the single changed row with JOINs, then merges into state.
 * For DELETE: removes the row from state by id (no refetch needed).
 */
export function useRealtimeSync<T extends { id: string }>({
  table,
  select,
  setItems,
  event = "*",
  filter,
  postProcess,
  enabled = true,
}: UseRealtimeSyncOptions<T>) {
  const supabase = useMemo(() => createClient(), []);

  const handlePayload = useCallback(
    async (payload: Payload) => {
      if (payload.eventType === "DELETE") {
        const oldId = (payload.old as { id?: string }).id;
        if (!oldId) return;
        setItems((prev) => prev.filter((item) => item.id !== oldId));
        return;
      }

      // INSERT or UPDATE — refetch the single row with JOINs
      const newId = (payload.new as { id?: string }).id;
      if (!newId) return;

      const { data, error } = await supabase
        .from(table)
        .select(select)
        .eq("id", newId)
        .single();

      if (error || !data) return;

      let row = data as unknown as T;
      if (postProcess) {
        row = await postProcess(row);
      }

      if (payload.eventType === "INSERT") {
        setItems((prev) => {
          // Avoid duplicates (e.g., if we also did a manual fetchX after create)
          if (prev.some((item) => item.id === newId)) return prev;
          return [row, ...prev];
        });
      } else {
        // UPDATE — replace in-place
        setItems((prev) =>
          prev.map((item) => (item.id === newId ? row : item))
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, table, select, postProcess]
  );

  useRealtime({
    table,
    event,
    filter,
    onPayload: handlePayload,
    enabled,
  });
}
