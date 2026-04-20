"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Stream } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";

export function useStreams() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchStreams = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("streams")
      .select("*")
      .eq("is_archived", false)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setStreams(data as Stream[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStreams();
  }, [fetchStreams]);

  // Real-time: direct merge (no JOINs), skip archived streams
  useRealtime({
    table: "streams",
    onPayload: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new as unknown as Stream;
        if (row.is_archived) return;
        setStreams((prev) => {
          if (prev.some((s) => s.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
        });
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new as unknown as Stream;
        if (row.is_archived) {
          // Archived — remove from active list
          setStreams((prev) => prev.filter((s) => s.id !== row.id));
        } else {
          setStreams((prev) =>
            prev.some((s) => s.id === row.id)
              ? prev.map((s) => (s.id === row.id ? row : s)).sort((a, b) => a.sort_order - b.sort_order)
              : [...prev, row].sort((a, b) => a.sort_order - b.sort_order)
          );
        }
      } else if (payload.eventType === "DELETE") {
        const oldId = (payload.old as Record<string, unknown>).id as string;
        setStreams((prev) => prev.filter((s) => s.id !== oldId));
      }
    },
  });

  async function createStream(name: string, type: Stream["type"] = "custom") {
    const maxSort = streams.length > 0 ? Math.max(...streams.map((s) => s.sort_order)) + 1 : 0;
    const { data: inserted, error } = await supabase.from("streams").insert({
      name,
      type,
      sort_order: maxSort,
    }).select("id").single();
    if (!error && inserted) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "stream",
        entity_id: inserted.id,
        action: "created",
        summary: `Created stream '${name}'`,
      });
      fetchStreams();
    }
  }

  async function updateStream(id: string, updates: Partial<Stream>) {
    const { error } = await supabase.from("streams").update(updates).eq("id", id);
    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "stream",
        entity_id: id,
        action: "updated",
        summary: `Updated stream`,
      });
      fetchStreams();
    }
  }

  async function archiveStream(id: string) {
    const stream = streams.find((s) => s.id === id);
    await supabase.from("streams").update({ is_archived: true }).eq("id", id);
    logAudit(supabase, {
      module: "tasks",
      entity_type: "stream",
      entity_id: id,
      action: "archived",
      summary: `Archived stream '${stream?.name ?? id}'`,
    });
    fetchStreams();
  }

  return {
    streams,
    loading,
    actions: {
      fetchStreams,
      createStream,
      updateStream,
      archiveStream,
    },
  };
}
