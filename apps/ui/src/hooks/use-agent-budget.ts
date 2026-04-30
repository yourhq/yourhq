"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentBudget } from "@/lib/usage/types";
import { useRealtime } from "./use-realtime";

export function useAgentBudget(agentId: string | null) {
  const [budget, setBudget] = useState<AgentBudget | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    const { data } = await supabase
      .from("agent_budgets")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle();
    setBudget((data as AgentBudget | null) ?? null);
    setLoading(false);
  }, [supabase, agentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!agentId) return;
      setLoading(true);
      const { data } = await supabase
        .from("agent_budgets")
        .select("*")
        .eq("agent_id", agentId)
        .maybeSingle();
      if (!cancelled) {
        setBudget((data as AgentBudget | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase, agentId]);

  useRealtime({
    table: "agent_budgets",
    filter: agentId ? `agent_id=eq.${agentId}` : undefined,
    onPayload: (payload) => {
      if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
        setBudget(payload.new as unknown as AgentBudget);
      }
    },
  });

  return { budget, loading, refresh };
}
