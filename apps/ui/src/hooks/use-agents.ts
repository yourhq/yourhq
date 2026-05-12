"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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

    if (error) {
      toast.error("Failed to load agents");
    } else if (data) {
      setAgents(data as Agent[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAgents();
  }, [fetchAgents]);

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
    const { error } = await supabase.from("agents").delete().eq("id", id);
    if (error) {
      toast.error(`Failed to delete agent: ${error.message}`);
      return;
    }
    toast.success(`Deleted ${agent?.name ?? "agent"}`);
    logAudit(supabase, {
      module: "agents",
      entity_type: "agent",
      entity_id: id,
      action: "deleted",
      summary: `Deleted agent '${agent?.name ?? id}'`,
    });
  }

  async function togglePause(id: string, currentStatus: string) {
    const agent = agents.find((a) => a.id === id);
    const newStatus = currentStatus === "paused" ? "ready" : "paused";

    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: newStatus as Agent["status"] } : a)),
    );

    const { error } = await supabase.from("agents").update({ status: newStatus }).eq("id", id);
    if (error) {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: currentStatus as Agent["status"] } : a)),
      );
      toast.error(`Failed to ${newStatus === "paused" ? "pause" : "resume"} agent`);
      return;
    }
    toast.success(newStatus === "paused" ? `Paused ${agent?.name}` : `Resumed ${agent?.name}`);
    logAudit(supabase, {
      module: "agents",
      entity_type: "agent",
      entity_id: id,
      action: "status_changed",
      summary: `${newStatus === "paused" ? "Paused" : "Resumed"} agent '${agent?.name ?? id}'`,
      changes: { status: { old: currentStatus, new: newStatus } },
    });
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
