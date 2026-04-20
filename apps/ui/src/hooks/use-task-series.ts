"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskSeries } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

export type NewSeriesInput = Omit<
  TaskSeries,
  | "id"
  | "created_at"
  | "updated_at"
  | "spawned_count"
  | "next_occurrence_at"
  | "last_spawned_at"
  | "stream"
  | "assignee_agent"
>;

export function useTaskSeries(options: { seriesId?: string } = {}) {
  const [seriesList, setSeriesList] = useState<TaskSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("task_series")
      .select(
        "*, stream:streams(id, name, color, icon), assignee_agent:agents(id, name, slug, avatar_url)"
      )
      .order("created_at", { ascending: false });

    if (options.seriesId) {
      query = query.eq("id", options.seriesId);
    }

    const { data, error } = await query;
    if (!error && data) {
      setSeriesList(data as unknown as TaskSeries[]);
    }
    setLoading(false);
  }, [supabase, options.seriesId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSeries();
  }, [fetchSeries]);

  useRealtime({
    table: "task_series",
    onPayload: () => fetchSeries(),
  });

  async function createSeries(input: NewSeriesInput): Promise<TaskSeries | null> {
    const { data, error } = await supabase
      .from("task_series")
      .insert(input)
      .select("*")
      .single();
    if (error) {
      console.error("[task_series] create failed:", error);
      toast.error("Failed to create recurring task", {
        description: error.message,
      });
      return null;
    }
    const row = data as unknown as TaskSeries;
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_series",
      entity_id: row.id,
      action: "created",
      summary: `Created recurring task '${row.title}'`,
    });

    // Kick the spawner immediately so if the first occurrence is
    // already due (e.g. cadence=daily with time earlier today, or
    // starts_on in the past), the user sees the instance right away
    // rather than waiting for pg_cron.
    const { error: spawnErr } = await supabase.rpc("spawn_due_task_instances");
    if (spawnErr) {
      console.warn("[task_series] spawn kick failed:", spawnErr.message);
    }

    fetchSeries();
    return row;
  }

  async function spawnNow() {
    const { error } = await supabase.rpc("spawn_due_task_instances");
    if (error) {
      toast.error("Spawn failed", { description: error.message });
      return false;
    }
    fetchSeries();
    return true;
  }

  async function updateSeries(
    id: string,
    updates: Partial<NewSeriesInput>,
    summaryHint?: string
  ) {
    const { error } = await supabase.from("task_series").update(updates).eq("id", id);
    if (error) {
      console.error("[task_series] update failed:", error);
      toast.error("Failed to update recurring task", {
        description: error.message,
      });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_series",
      entity_id: id,
      action: "updated",
      summary: summaryHint ?? `Updated recurring task`,
    });
    fetchSeries();
  }

  async function pauseSeries(id: string) {
    await updateSeries(id, { is_paused: true } as Partial<NewSeriesInput>, "Paused recurring task");
  }

  async function resumeSeries(id: string) {
    await updateSeries(id, { is_paused: false } as Partial<NewSeriesInput>, "Resumed recurring task");
  }

  async function deleteSeries(id: string) {
    const { error } = await supabase.from("task_series").delete().eq("id", id);
    if (error) {
      console.error("[task_series] delete failed:", error);
      toast.error("Failed to delete recurring task", {
        description: error.message,
      });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_series",
      entity_id: id,
      action: "deleted",
      summary: `Deleted recurring task`,
    });
    fetchSeries();
  }

  return {
    seriesList,
    series: options.seriesId ? seriesList[0] ?? null : null,
    loading,
    actions: {
      fetchSeries,
      createSeries,
      updateSeries,
      pauseSeries,
      resumeSeries,
      deleteSeries,
      spawnNow,
    },
  };
}
