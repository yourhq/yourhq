"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Routine, TriggerType } from "@/lib/routines/types";
import { logAudit } from "@/lib/audit/log";
import { completeItem } from "@/lib/onboarding/progress";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

const ROUTINE_SELECT =
  "*, agent:agents!routines_agent_id_fkey(id, name, slug)";

function updateUrl(params: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === "" || v === "all") {
      url.searchParams.delete(k);
    } else {
      url.searchParams.set(k, v);
    }
  }
  window.history.replaceState(null, "", url.toString());
}

export function useRoutines() {
  const searchParams = useSearchParams();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);

  const supabase = useMemo(() => createClient(), []);

  // Filters
  const [search, setSearchState] = useState(searchParams.get("q") ?? "");
  const [triggerFilter, setTriggerFilterState] = useState<"all" | TriggerType>(
    (searchParams.get("trigger") as "all" | TriggerType) ?? "all"
  );

  function setSearch(v: string) {
    setSearchState(v);
    updateUrl({ q: v || null });
  }

  function setTriggerFilter(v: "all" | TriggerType) {
    setTriggerFilterState(v);
    updateUrl({ trigger: v === "all" ? null : v });
  }

  const fetchRoutines = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("routines")
      .select(ROUTINE_SELECT)
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRoutines(data as unknown as Routine[]);
    }
    setLoading(false);
  }, [supabase]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchRoutines();
  }, [fetchRoutines]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useRealtime({
    table: "routines",
    onPayload: () => fetchRoutines(),
  });

  // Filtered items
  const filtered = useMemo(() => {
    let items = routines;
    if (triggerFilter !== "all") {
      items = items.filter((r) => r.trigger_type === triggerFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.instruction.toLowerCase().includes(q) ||
          r.agent?.name?.toLowerCase().includes(q) ||
          r.agent_slug.toLowerCase().includes(q)
      );
    }
    return items;
  }, [routines, triggerFilter, search]);

  async function createRoutine(input: Partial<Routine>): Promise<Routine | null> {
    const agent = input.agent_id
      ? (await supabase.from("agents").select("slug").eq("id", input.agent_id).single()).data
      : null;

    const payload = {
      ...input,
      agent_slug: agent?.slug ?? input.agent_slug ?? "",
    };

    if (input.trigger_type === "schedule" && input.cadence_type && input.timezone) {
      const { data: nextRun } = await supabase.rpc("routine_next_occurrence", {
        p_cadence_type: input.cadence_type,
        p_interval_n: input.interval_n ?? null,
        p_days_of_week: input.days_of_week ?? [],
        p_day_of_month: input.day_of_month ?? null,
        p_time_of_day: input.time_of_day ?? null,
        p_timezone: input.timezone,
        p_from: new Date().toISOString(),
      });
      (payload as Record<string, unknown>).next_run_at = nextRun;
    }

    const { data, error } = await supabase
      .from("routines")
      .insert(payload)
      .select(ROUTINE_SELECT)
      .single();

    if (error) {
      toast.error("Failed to create routine", { description: error.message });
      return null;
    }

    const routine = data as unknown as Routine;
    logAudit(supabase, {
      module: "routines",
      entity_type: "routine",
      entity_id: routine.id,
      action: "created",
      summary: `Created routine "${routine.name}"`,
    });
    completeItem("routineCreated");

    fetchRoutines();
    return routine;
  }

  async function updateRoutine(id: string, updates: Partial<Routine>) {
    if (updates.cadence_type && updates.timezone) {
      const { data: nextRun } = await supabase.rpc("routine_next_occurrence", {
        p_cadence_type: updates.cadence_type,
        p_interval_n: updates.interval_n ?? null,
        p_days_of_week: updates.days_of_week ?? [],
        p_day_of_month: updates.day_of_month ?? null,
        p_time_of_day: updates.time_of_day ?? null,
        p_timezone: updates.timezone,
        p_from: new Date().toISOString(),
      });
      (updates as Record<string, unknown>).next_run_at = nextRun;
    }

    const { error } = await supabase.from("routines").update(updates).eq("id", id);
    if (error) {
      toast.error("Failed to update routine", { description: error.message });
      return;
    }
    const routine = routines.find((r) => r.id === id);
    logAudit(supabase, {
      module: "routines",
      entity_type: "routine",
      entity_id: id,
      action: "updated",
      summary: `Updated routine "${routine?.name ?? id}"`,
    });
    fetchRoutines();
  }

  async function deleteRoutine(id: string) {
    const routine = routines.find((r) => r.id === id);
    const { error } = await supabase.from("routines").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete routine", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "routines",
      entity_type: "routine",
      entity_id: id,
      action: "deleted",
      summary: `Deleted routine "${routine?.name ?? id}"`,
    });
    fetchRoutines();
  }

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
      toast.error("Failed to toggle routine", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "routines",
      entity_type: "routine",
      entity_id: id,
      action: "updated",
      summary: newState
        ? `Activated routine "${routine?.name ?? id}"`
        : `Paused routine "${routine?.name ?? id}"`,
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

    await supabase
      .from("routines")
      .update({
        last_run_at: new Date().toISOString(),
        run_count: (routine.run_count ?? 0) + 1,
      })
      .eq("id", routine.id);

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

    fetchRoutines();
  }

  function openCreateForm() {
    setEditingRoutine(null);
    setShowForm(true);
  }

  function openEditForm(routine: Routine) {
    setEditingRoutine(routine);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingRoutine(null);
  }

  function onFormSaved() {
    closeForm();
    fetchRoutines();
  }

  return {
    routines: filtered,
    allRoutines: routines,
    loading,
    filters: {
      search,
      setSearch,
      triggerFilter,
      setTriggerFilter,
    },
    actions: {
      createRoutine,
      updateRoutine,
      deleteRoutine,
      toggleActive,
      runNow,
      refetch: fetchRoutines,
    },
    form: {
      showForm,
      editingRoutine,
      openCreateForm,
      openEditForm,
      closeForm,
      onFormSaved,
    },
  };
}
