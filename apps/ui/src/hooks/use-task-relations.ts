"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskRelation, TaskRelationType } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";

export function useTaskRelations(taskId: string | null) {
  const [relations, setRelations] = useState<TaskRelation[]>([]);
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchRelations = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);

    const { data, error } = await supabase.rpc("get_task_relations", {
      p_task_id: taskId,
    });

    if (!error && data) {
      setRelations(data as unknown as TaskRelation[]);
    }
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  useRealtime({
    table: "task_relations",
    event: "*",
    onPayload: (payload) => {
      const row = (payload.new ?? payload.old) as Record<string, unknown>;
      if (
        row?.source_task_id === taskId ||
        row?.target_task_id === taskId
      ) {
        fetchRelations();
      }
    },
    enabled: !!taskId,
  });

  async function addRelation(targetTaskId: string, relationType: TaskRelationType) {
    if (!taskId) return { error: new Error("No task ID") };

    const { error } = await supabase.from("task_relations").insert({
      source_task_id: taskId,
      target_task_id: targetTaskId,
      relation_type: relationType,
      created_by_type: "human",
    });

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_relation",
        entity_id: taskId,
        action: "created",
        summary: `Added ${relationType} relation to task`,
      });
      fetchRelations();
    }
    return { error };
  }

  async function removeRelation(relationId: string) {
    const { error } = await supabase
      .from("task_relations")
      .delete()
      .eq("id", relationId);

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_relation",
        entity_id: relationId,
        action: "deleted",
        summary: "Removed task relation",
      });
      fetchRelations();
    }
    return { error };
  }

  async function searchTasks(query: string): Promise<{ id: string; title: string; status: string }[]> {
    if (!query.trim()) return [];
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status")
      .ilike("title", `%${query.trim()}%`)
      .neq("id", taskId ?? "")
      .is("archived_at", null)
      .limit(10);
    return (data ?? []) as { id: string; title: string; status: string }[];
  }

  return {
    relations,
    loading,
    actions: { addRelation, removeRelation, searchTasks, fetchRelations },
  };
}
