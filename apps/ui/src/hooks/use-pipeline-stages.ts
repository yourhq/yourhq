"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PipelineStage } from "@/lib/fields/types";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { useRealtimeSync } from "./use-realtime-sync";

/**
 * Fetches pipeline stages for a given entity type (contact, organization, etc.).
 * Replaces hardcoded OUTREACH_STATUSES. Cached in state; refreshable on demand.
 */
export function usePipelineStages(entityType: string = "contact") {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchStages = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("entity_type", entityType)
      .order("sort_order", { ascending: true });
    if (!error && data) {
      setStages(data as PipelineStage[]);
    }
    setLoading(false);
  }, [supabase, entityType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStages();
  }, [fetchStages]);

  // Realtime: stay in sync with Settings edits
  useRealtimeSync<PipelineStage>({
    table: "pipeline_stages",
    select: "*",
    items: stages,
    setItems: setStages,
    filter: `entity_type=eq.${entityType}`,
  });

  const stagesByKey = useMemo(() => {
    const map: Record<string, PipelineStage> = {};
    for (const s of stages) map[s.stage_key] = s;
    return map;
  }, [stages]);

  const defaultStage = useMemo(
    () => stages.find((s) => s.is_default) ?? stages[0] ?? null,
    [stages]
  );

  const nonTerminalStages = useMemo(
    () => stages.filter((s) => !s.is_terminal),
    [stages]
  );

  const terminalStages = useMemo(
    () => stages.filter((s) => s.is_terminal),
    [stages]
  );

  const getStageLabel = useCallback(
    (key: string | null | undefined): string => {
      if (!key) return "—";
      return stagesByKey[key]?.label ?? key;
    },
    [stagesByKey]
  );

  const getStageColor = useCallback(
    (key: string | null | undefined): string => {
      if (!key) return DEFAULT_STAGE_COLOR;
      return stagesByKey[key]?.color ?? DEFAULT_STAGE_COLOR;
    },
    [stagesByKey]
  );

  return {
    stages,
    stagesByKey,
    defaultStage,
    nonTerminalStages,
    terminalStages,
    loading,
    refresh: fetchStages,
    getStageLabel,
    getStageColor,
    // Sorted sorted in their natural order, useful for <Select> dropdowns
    stageOptions: stages
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ value: s.stage_key, label: s.label })),
  };
}
