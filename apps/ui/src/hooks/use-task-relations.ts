"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskRelation, TaskRelationType } from "@/lib/tasks/types";
import { RELATION_TYPES } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";
import { toast } from "sonner";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

    const inverse = RELATION_TYPES.find((r) => r.value === relationType)?.inverse;

    // Check for direct inverse (A blocks B + B blocks A)
    if (inverse) {
      const { data: existing } = await supabase
        .from("task_relations")
        .select("id")
        .eq("source_task_id", targetTaskId)
        .eq("target_task_id", taskId)
        .eq("relation_type", inverse)
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error("This would create a circular dependency");
        return { error: new Error("Circular dependency") };
      }
    }

    // For blocker relations, check transitive cycles (A←B←C, adding C←A)
    if (relationType === "blocked_by" || relationType === "blocks") {
      const sourceId = relationType === "blocked_by" ? taskId : targetTaskId;
      const blockerId = relationType === "blocked_by" ? targetTaskId : taskId;
      const hasCycle = await detectBlockerCycle(supabase, sourceId, blockerId);
      if (hasCycle) {
        toast.error("This would create a circular dependency chain");
        return { error: new Error("Circular dependency chain") };
      }
    }

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

// BFS: walk the blocked_by chain from blockerId to see if it reaches sourceId.
// If it does, adding sourceId←blockerId would create a cycle.
async function detectBlockerCycle(
  supabase: ReturnType<typeof createClient>,
  sourceId: string,
  blockerId: string,
): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [blockerId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const { data } = await supabase
      .from("task_relations")
      .select("target_task_id")
      .eq("source_task_id", current)
      .eq("relation_type", "blocked_by");

    if (!data) continue;
    for (const row of data) {
      if (row.target_task_id === sourceId) return true;
      if (!visited.has(row.target_task_id)) queue.push(row.target_task_id);
    }

    if (visited.size > 50) break;
  }
  return false;
}
