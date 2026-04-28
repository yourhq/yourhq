"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AgentCommand, CommandStatus } from "@/lib/agents/types";
import { useRealtime } from "./use-realtime";

const PAGE_SIZE = 20;

interface UseAgentCommandsOptions {
  /** Filter to a specific agent. Omit for system-wide commands. */
  agentId?: string;
  /** Filter to commands targeting a specific gateway. */
  gatewayId?: string;
  /** Only show system commands (no agent_id). */
  systemOnly?: boolean;
}

export function useAgentCommands({
  agentId,
  gatewayId,
  systemOnly,
}: UseAgentCommandsOptions = {}) {
  const [commands, setCommands] = useState<AgentCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CommandStatus | "all">("all");

  const supabase = useMemo(() => createClient(), []);

  const fetchCommands = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);

    let query = supabase
      .from("agent_commands")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (agentId) query = query.eq("agent_id", agentId);
    if (gatewayId) query = query.eq("gateway_id", gatewayId);
    if (systemOnly) query = query.is("agent_id", null);
    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (!error && data) {
      const typed = data as unknown as AgentCommand[];
      if (offset === 0) {
        setCommands(typed);
      } else {
        setCommands((prev) => [...prev, ...typed]);
      }
      setHasMore(typed.length === PAGE_SIZE);
    }
    setLoading(false);
  }, [supabase, agentId, gatewayId, systemOnly, statusFilter]);

  // Initial fetch — deferred so the effect's setStates don't synchronously
  // cascade-render. fetchCommands is awaited internally so cleanup races
  // are handled by its own logic.
  useEffect(() => {
    const t = setTimeout(() => {
      void fetchCommands(0);
    }, 0);
    return () => clearTimeout(t);
  }, [fetchCommands]);

  // Subscribe to realtime changes for live status updates. We pick the
  // narrowest filter that's safe — agent > gateway > none. Server-side
  // postgres_changes only supports a single filter expression, so we
  // can't AND multiple. The fetch query above re-applies all filters,
  // so a slightly broader subscription is fine (we just refetch a bit
  // more often than strictly needed).
  const realtimeFilter = agentId
    ? `agent_id=eq.${agentId}`
    : gatewayId
      ? `gateway_id=eq.${gatewayId}`
      : undefined;

  useRealtime({
    table: "agent_commands",
    ...(realtimeFilter ? { filter: realtimeFilter } : {}),
    onPayload: () => {
      fetchCommands(0);
    },
  });

  // For system-only mode, also subscribe without agent filter
  useRealtime({
    table: "agent_commands",
    enabled: !!systemOnly && !agentId && !gatewayId,
    onPayload: () => {
      fetchCommands(0);
    },
  });

  function loadMore() {
    fetchCommands(commands.length);
  }

  return {
    commands,
    loading,
    hasMore,
    loadMore,
    statusFilter,
    setStatusFilter,
    refetch: () => fetchCommands(0),
  };
}
