"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Routine } from "@/lib/routines/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

const ROUTINE_SELECT =
  "*, agent:agents!routines_agent_id_fkey(id, name, slug)";

export function useAgentRoutines(agentId: string) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchRoutines = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("routines")
      .select(ROUTINE_SELECT)
      .eq("agent_id", agentId)
      .is("archived_at", null)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRoutines(data as unknown as Routine[]);
    }
    setLoading(false);
  }, [supabase, agentId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "routines",
    filter: `agent_id=eq.${agentId}`,
    onPayload: () => fetchRoutines(),
  });

  async function toggleActive(id: string, currentState: boolean) {
    const newState = !currentState;
    const routine = routines.find((r) => r.id === id);

    const payload: Record<string, unknown> = { is_active: newState };

    if (newState && routine?.trigger_type === "schedule" && routine.cadence_type && routine.timezone) {
      const { data: nextRun } = await supabase.rpc("routine_next_occurrence", {
        p_cadence_type: routine.cadence_type,
        p_interval_n: routine.interval_n ?? null,
        p_days_of_week: routine.days_of_week ?? [],
        p_day_of_month: routine.day_of_month ?? null,
        p_time_of_day: routine.time_of_day ?? null,
        p_timezone: routine.timezone,
        p_from: new Date().toISOString(),
      });
      payload.next_run_at = nextRun;
    }

    const { error } = await supabase
      .from("routines")
      .update(payload)
      .eq("id", id);
    if (error) {
      toast.error("Failed to toggle", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "routines",
      entity_type: "routine",
      entity_id: id,
      action: "updated",
      summary: newState ? "Activated routine" : "Paused routine",
    });
    fetchRoutines();
  }

  async function deleteRoutine(id: string) {
    const { error } = await supabase.from("routines").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "routines",
      entity_type: "routine",
      entity_id: id,
      action: "deleted",
      summary: "Deleted routine",
    });
    fetchRoutines();
  }

  async function runNow(id: string) {
    const routine = routines.find((r) => r.id === id);
    if (!routine) return;

    const { error } = await supabase.from("agent_inbox_items").insert({
      agent_id: routine.agent_id,
      agent_slug: routine.agent_slug,
      event_type: routine.trigger_type === "schedule" ? "routine_schedule" : "routine_event",
      status: "pending",
      summary: routine.instruction || routine.name,
      context: {
        routine_id: routine.id,
        routine_name: routine.name,
        instruction: routine.instruction,
        manual_trigger: true,
      },
      dedup_key: `routine_manual:${routine.id}:${Date.now()}`,
    });

    if (error) {
      toast.error("Failed to trigger routine", { description: error.message });
      return;
    }

    toast.success(`"${routine.name}" triggered`, {
      description: "The agent will process it shortly.",
    });

    logAudit(supabase, {
      module: "routines",
      entity_type: "routine",
      entity_id: routine.id,
      action: "updated",
      summary: `Manually triggered routine "${routine.name}"`,
    });
  }

  return {
    routines,
    loading,
    actions: { toggleActive, deleteRoutine, runNow, refetch: fetchRoutines },
  };
}
