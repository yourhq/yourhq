"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AutomationRule } from "@/lib/automations/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";

const RULE_SELECT = "*, target_agent:agents!automation_rules_target_agent_id_fkey(id, name, slug)";

export function useAutomationRules() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("automation_rules")
      .select(RULE_SELECT)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setRules(data as unknown as AutomationRule[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRules();
  }, [fetchRules]);

  useRealtime({
    table: "automation_rules",
    onPayload: () => {
      fetchRules();
    },
  });

  async function deleteRule(id: string) {
    const rule = rules.find((r) => r.id === id);
    await supabase.from("automation_rules").delete().eq("id", id);
    logAudit(supabase, {
      module: "automations",
      entity_type: "automation_rule",
      entity_id: id,
      action: "deleted",
      summary: `Deleted automation rule for ${rule?.table_name}.${rule?.field ?? "*"} → ${rule?.target_agent_slug ?? "unknown"}`,
    });
    fetchRules();
  }

  async function toggleActive(id: string, currentState: boolean) {
    const newState = !currentState;
    await supabase.from("automation_rules").update({ is_active: newState }).eq("id", id);
    const rule = rules.find((r) => r.id === id);
    logAudit(supabase, {
      module: "automations",
      entity_type: "automation_rule",
      entity_id: id,
      action: "updated",
      summary: `${newState ? "Enabled" : "Disabled"} automation rule for ${rule?.table_name}.${rule?.field ?? "*"} → ${rule?.target_agent_slug ?? "unknown"}`,
      changes: { is_active: { old: currentState, new: newState } },
    });
    fetchRules();
  }

  function openCreateForm() {
    setEditingRule(null);
    setShowForm(true);
  }

  function openEditForm(rule: AutomationRule) {
    setEditingRule(rule);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingRule(null);
  }

  function onFormSaved() {
    closeForm();
    fetchRules();
  }

  return {
    rules,
    loading,
    actions: {
      fetchRules,
      deleteRule,
      toggleActive,
    },
    form: {
      showForm,
      editingRule,
      openCreateForm,
      openEditForm,
      closeForm,
      onFormSaved,
    },
  };
}
