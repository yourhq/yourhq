"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Label } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";

export function useLabels() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchLabels = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("labels")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) {
      setLabels(data as Label[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchLabels();
  }, [fetchLabels]);

  useRealtime({
    table: "labels",
    event: "*",
    onPayload: () => fetchLabels(),
  });

  async function createLabel(name: string, color: string, description?: string) {
    const { data, error } = await supabase
      .from("labels")
      .insert({ name, color, description: description ?? null })
      .select("*")
      .single();

    if (!error && data) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "label",
        entity_id: data.id,
        action: "created",
        summary: `Created label "${name}"`,
      });
      fetchLabels();
    }
    return { data: data as Label | null, error };
  }

  async function updateLabel(id: string, updates: Partial<Pick<Label, "name" | "color" | "description">>) {
    const { error } = await supabase
      .from("labels")
      .update(updates)
      .eq("id", id);

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "label",
        entity_id: id,
        action: "updated",
        summary: `Updated label`,
      });
      fetchLabels();
    }
    return { error };
  }

  async function deleteLabel(id: string) {
    const { error } = await supabase.from("labels").delete().eq("id", id);

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "label",
        entity_id: id,
        action: "deleted",
        summary: "Deleted label",
      });
      fetchLabels();
    }
    return { error };
  }

  async function addLabelToTask(taskId: string, labelId: string) {
    const { error } = await supabase
      .from("task_labels")
      .insert({ task_id: taskId, label_id: labelId });

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_label",
        entity_id: taskId,
        action: "created",
        summary: "Added label to task",
      });
    }
    return { error };
  }

  async function removeLabelFromTask(taskId: string, labelId: string) {
    const { error } = await supabase
      .from("task_labels")
      .delete()
      .eq("task_id", taskId)
      .eq("label_id", labelId);

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_label",
        entity_id: taskId,
        action: "deleted",
        summary: "Removed label from task",
      });
    }
    return { error };
  }

  async function getTaskLabels(taskId: string): Promise<Label[]> {
    const { data } = await supabase
      .from("task_labels")
      .select("label_id, labels(*)")
      .eq("task_id", taskId);

    if (!data) return [];
    return data
      .map((row: Record<string, unknown>) => row.labels as Label | null)
      .filter((l): l is Label => l !== null);
  }

  return {
    labels,
    loading,
    actions: {
      createLabel,
      updateLabel,
      deleteLabel,
      addLabelToTask,
      removeLabelFromTask,
      getTaskLabels,
      fetchLabels,
    },
  };
}
