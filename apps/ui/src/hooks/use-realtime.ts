"use client";

import { useEffect, useId, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface UseRealtimeOptions {
  table: string;
  schema?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  onPayload: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  enabled?: boolean;
}

/**
 * Subscribe to Supabase Realtime Postgres changes on a table.
 *
 * Usage:
 * ```ts
 * useRealtime({
 *   table: 'audit_log',
 *   event: 'INSERT',
 *   onPayload: (payload) => {
 *     // New audit log entry — refresh the feed
 *     refetch();
 *   },
 * });
 * ```
 */
export function useRealtime({
  table,
  schema = "public",
  event = "*",
  filter,
  onPayload,
  enabled = true,
}: UseRealtimeOptions) {
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);
  const instanceId = useId();
  const onPayloadRef = useRef(onPayload);

  useEffect(() => {
    onPayloadRef.current = onPayload;
  }, [onPayload]);

  useEffect(() => {
    if (!enabled || !supabase) return;

    // Channel names must be unique per hook instance. Two components subscribing
    // to the same table with the same filter would otherwise collide and Supabase
    // throws "mismatch between server and client bindings for postgres changes".
    const channelName = `realtime:${table}:${event}:${filter || "all"}:${instanceId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event,
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          onPayloadRef.current(payload as RealtimePostgresChangesPayload<Record<string, unknown>>);
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.error(`[realtime] ${channelName} error:`, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, table, schema, event, filter, enabled, instanceId]);
}
