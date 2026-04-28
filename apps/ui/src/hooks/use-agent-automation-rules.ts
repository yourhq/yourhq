"use client";

// Agent-scoped read of automation_rules. Used by the Triggers section
// in the agent Overview tab.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AutomationRule } from "@/lib/automations/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

const RULE_SELECT =
  "*, target_agent:agents!automation_rules_target_agent_id_fkey(id, name, slug)";

export function useAgentAutomationRules(agentId: string) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_rules")
      .select(RULE_SELECT)
      .eq("target_agent_id", agentId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRules(data as unknown as AutomationRule[]);
    }
    setLoading(false);
  }, [supabase, agentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRules();
  }, [fetchRules]);

  useRealtime({
    table: "automation_rules",
    filter: `target_agent_id=eq.${agentId}`,
    onPayload: () => fetchRules(),
  });

  async function toggleActive(id: string, currentState: boolean) {
    const newState = !currentState;
    const { error } = await supabase
      .from("automation_rules")
      .update({ is_active: newState })
      .eq("id", id);
    if (error) {
      toast.error("Failed to toggle", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "automations",
      entity_type: "automation_rule",
      entity_id: id,
      action: "updated",
      summary: newState ? "Activated automation rule" : "Paused automation rule",
    });
    fetchRules();
  }

  async function deleteRule(id: string) {
    const { error } = await supabase
      .from("automation_rules")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete", { description: error.message });
      return;
    }
    logAudit(supabase, {
      module: "automations",
      entity_type: "automation_rule",
      entity_id: id,
      action: "deleted",
      summary: "Deleted automation rule",
    });
    fetchRules();
  }

  return {
    rules,
    loading,
    actions: { toggleActive, deleteRule, refetch: fetchRules },
  };
}
