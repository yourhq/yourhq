"use client";

// Agent-scoped read of task_series. The Triggers section in the agent
// Overview tab uses this to render only series that wake THIS agent.
//
// Mirrors useTaskSeries (the global hook backing /dashboard/tasks)
// but with an agent_id filter on the query AND the realtime
// subscription, so we don't refetch when an unrelated series in
// another agent's stream changes.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskSeries } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

export function useAgentTaskSeries(agentId: string) {
  const [seriesList, setSeriesList] = useState<TaskSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("task_series")
      .select(
        "*, stream:streams(id, name, color, icon), assignee_agent:agents(id, name, slug, avatar_url)",
      )
      // Active series first (paused at the bottom), then by next fire
      // time so the most-imminent occurrence sits at the top.
      .eq("assignee_agent_id", agentId)
      .order("is_paused", { ascending: true })
      .order("next_occurrence_at", { ascending: true, nullsFirst: false });

    if (!error && data) {
      setSeriesList(data as unknown as TaskSeries[]);
    }
    setLoading(false);
  }, [supabase, agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSeries();
  }, [fetchSeries]);

  useRealtime({
    table: "task_series",
    filter: `assignee_agent_id=eq.${agentId}`,
    onPayload: () => fetchSeries(),
  });

  // ── Mutations ──────────────────────────────────────────────────────

  async function pauseSeries(id: string) {
    const { error } = await supabase
      .from("task_series")
      .update({ is_paused: true })
      .eq("id", id);
    if (error) {
      toast.error("Failed to pause", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_series",
      entity_id: id,
      action: "updated",
      summary: "Paused recurring task",
    });
    fetchSeries();
  }

  async function resumeSeries(id: string) {
    const { error } = await supabase
      .from("task_series")
      .update({ is_paused: false })
      .eq("id", id);
    if (error) {
      toast.error("Failed to resume", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_series",
      entity_id: id,
      action: "updated",
      summary: "Resumed recurring task",
    });
    fetchSeries();
  }

  async function deleteSeries(id: string) {
    const { error } = await supabase.from("task_series").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_series",
      entity_id: id,
      action: "deleted",
      summary: "Deleted recurring task",
    });
    fetchSeries();
  }

  return {
    seriesList,
    loading,
    actions: { pauseSeries, resumeSeries, deleteSeries, refetch: fetchSeries },
  };
}
