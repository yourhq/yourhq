"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskTemplate, TaskTemplateItem, TaskPriority } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";

interface SpawnOverrides {
  stream_id?: string;
  assignee_map?: Record<string, string>;
}

export function useTaskTemplates() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("task_templates")
      .select("*")
      .order("name", { ascending: true });

    if (!error && data) {
      setTemplates(data as unknown as TaskTemplate[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  async function createTemplate(template: {
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    items: TaskTemplateItem[];
  }) {
    const { data, error } = await supabase
      .from("task_templates")
      .insert({
        name: template.name,
        description: template.description ?? null,
        icon: template.icon ?? null,
        color: template.color ?? null,
        items: template.items as unknown as Record<string, unknown>[],
      })
      .select("*")
      .single();

    if (!error && data) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_template",
        entity_id: data.id,
        action: "created",
        summary: `Created template "${template.name}"`,
      });
      fetchTemplates();
    }
    return { data: data as unknown as TaskTemplate | null, error };
  }

  async function updateTemplate(
    id: string,
    updates: Partial<Pick<TaskTemplate, "name" | "description" | "icon" | "color" | "items" | "meta">>
  ) {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.icon !== undefined) payload.icon = updates.icon;
    if (updates.color !== undefined) payload.color = updates.color;
    if (updates.items !== undefined) payload.items = updates.items;
    if (updates.meta !== undefined) payload.meta = updates.meta;

    const { error } = await supabase
      .from("task_templates")
      .update(payload)
      .eq("id", id);

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_template",
        entity_id: id,
        action: "updated",
        summary: "Updated template",
      });
      fetchTemplates();
    }
    return { error };
  }

  async function deleteTemplate(id: string) {
    const { error } = await supabase.from("task_templates").delete().eq("id", id);

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_template",
        entity_id: id,
        action: "deleted",
        summary: "Deleted template",
      });
      fetchTemplates();
    }
    return { error };
  }

  async function spawnFromTemplate(templateId: string, overrides?: SpawnOverrides) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return { error: new Error("Template not found") };

    const items = template.items;
    const refToTaskId = new Map<string, string>();
    const createdTaskIds: string[] = [];

    // Resolve assignee roles to agent IDs
    const assigneeMap = overrides?.assignee_map ?? {};
    let agentsBySlug = new Map<string, string>();

    const roles = items
      .map((item) => item.assignee_role)
      .filter((r): r is string => !!r && !assigneeMap[r]);

    if (roles.length > 0) {
      const { data: agents } = await supabase
        .from("agents")
        .select("id, slug, domains")
        .in("slug", [...new Set(roles)]);

      if (agents) {
        agentsBySlug = new Map(agents.map((a) => [a.slug, a.id]));
      }
    }

    // Resolve label names to IDs
    const allLabelNames = [...new Set(items.flatMap((item) => item.labels ?? []))];
    let labelNameToId = new Map<string, string>();

    if (allLabelNames.length > 0) {
      const { data: labels } = await supabase
        .from("labels")
        .select("id, name")
        .in("name", allLabelNames);

      if (labels) {
        labelNameToId = new Map(labels.map((l) => [l.name, l.id]));
      }
    }

    for (const item of items) {
      const agentId =
        assigneeMap[item.assignee_role ?? ""] ??
        agentsBySlug.get(item.assignee_role ?? "") ??
        null;

      const { data: task, error } = await supabase
        .from("tasks")
        .insert({
          title: item.title,
          description: item.description ?? null,
          priority: (item.priority as TaskPriority) ?? "medium",
          status: "todo",
          stream_id: overrides?.stream_id ?? null,
          assignee_type: agentId ? "agent" : null,
          assignee_agent_id: agentId,
        })
        .select("id")
        .single();

      if (error || !task) continue;

      refToTaskId.set(item.ref, task.id);
      createdTaskIds.push(task.id);

      // Assign labels
      const labelInserts = (item.labels ?? [])
        .map((name) => labelNameToId.get(name))
        .filter((id): id is string => !!id)
        .map((labelId) => ({ task_id: task.id, label_id: labelId }));

      if (labelInserts.length > 0) {
        await supabase.from("task_labels").insert(labelInserts);
      }
    }

    // Create relations from blocked_by references
    const relationInserts: { source_task_id: string; target_task_id: string; relation_type: string; created_by_type: string }[] = [];
    for (const item of items) {
      const taskId = refToTaskId.get(item.ref);
      if (!taskId || !item.blocked_by?.length) continue;

      for (const blockerRef of item.blocked_by) {
        const blockerId = refToTaskId.get(blockerRef);
        if (!blockerId) continue;
        relationInserts.push({
          source_task_id: taskId,
          target_task_id: blockerId,
          relation_type: "blocked_by",
          created_by_type: "system",
        });
      }
    }

    if (relationInserts.length > 0) {
      await supabase.from("task_relations").insert(relationInserts);
    }

    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_template",
      entity_id: template.id,
      action: "created",
      summary: `Spawned ${createdTaskIds.length} tasks from template "${template.name}"`,
    });

    return { data: createdTaskIds, error: null };
  }

  return {
    templates,
    loading,
    actions: {
      createTemplate,
      updateTemplate,
      deleteTemplate,
      spawnFromTemplate,
      fetchTemplates,
    },
  };
}
