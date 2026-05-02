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

  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);

  useRealtime({
    table: "routines",
    filter: `agent_id=eq.${agentId}`,
    onPayload: () => fetchRoutines(),
  });

  async function toggleActive(id: string, currentState: boolean) {
    const newState = !currentState;
    const { error } = await supabase
      .from("routines")
      .update({ is_active: newState })
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

  return {
    routines,
    loading,
    actions: { toggleActive, deleteRoutine, refetch: fetchRoutines },
  };
}
