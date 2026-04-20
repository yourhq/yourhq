"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Agent } from "@/lib/agents/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agents")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) {
      setAgents(data as Agent[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAgents();
  }, [fetchAgents]);

  // Real-time: direct merge (no JOINs)
  useRealtime({
    table: "agents",
    onPayload: (payload) => {
      if (payload.eventType === "INSERT") {
        const row = payload.new as unknown as Agent;
        setAgents((prev) => {
          if (prev.some((a) => a.id === row.id)) return prev;
          return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
        });
      } else if (payload.eventType === "UPDATE") {
        const row = payload.new as unknown as Agent;
        setAgents((prev) => prev.map((a) => (a.id === row.id ? row : a)));
      } else if (payload.eventType === "DELETE") {
        const oldId = (payload.old as Record<string, unknown>).id as string;
        setAgents((prev) => prev.filter((a) => a.id !== oldId));
      }
    },
  });

  async function deleteAgent(id: string) {
    const agent = agents.find((a) => a.id === id);
    await supabase.from("agents").delete().eq("id", id);
    logAudit(supabase, {
      module: "agents",
      entity_type: "agent",
      entity_id: id,
      action: "deleted",
      summary: `Deleted agent '${agent?.name ?? id}'`,
    });
    fetchAgents();
  }

  async function togglePause(id: string, currentStatus: string) {
    const agent = agents.find((a) => a.id === id);
    const newStatus = currentStatus === "paused" ? "offline" : "paused";
    await supabase.from("agents").update({ status: newStatus }).eq("id", id);
    logAudit(supabase, {
      module: "agents",
      entity_type: "agent",
      entity_id: id,
      action: "status_changed",
      summary: `${newStatus === "paused" ? "Paused" : "Resumed"} agent '${agent?.name ?? id}'`,
      changes: { status: { old: currentStatus, new: newStatus } },
    });
    fetchAgents();
  }

  function openCreateForm() {
    setEditingAgent(null);
    setShowForm(true);
  }

  function openEditForm(agent: Agent) {
    setEditingAgent(agent);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingAgent(null);
  }

  function onFormSaved() {
    closeForm();
    fetchAgents();
  }

  return {
    agents,
    loading,
    actions: {
      fetchAgents,
      deleteAgent,
      togglePause,
    },
    form: {
      showForm,
      editingAgent,
      openCreateForm,
      openEditForm,
      closeForm,
      onFormSaved,
    },
  };
}
