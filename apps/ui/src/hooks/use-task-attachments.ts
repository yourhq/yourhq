"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskAttachment, AttachmentEntityType } from "@/lib/tasks/types";
import { logAudit } from "@/lib/audit/log";

interface AddAttachmentInput {
  entity_type: AttachmentEntityType;
  entity_id?: string;
  url?: string;
  label?: string;
}

interface SearchResult {
  id: string;
  name: string;
  type: AttachmentEntityType;
  icon?: string;
  asset_type?: string;
}

export function useTaskAttachments(taskId: string) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  const fetchAttachments = useCallback(async () => {
    setLoading(true);

    const { data: rows, error } = await supabase
      .from("task_attachments")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (error || !rows) {
      setLoading(false);
      return;
    }

    // Batch-resolve document and asset names
    const docIds = rows.filter((r) => r.entity_type === "document" && r.entity_id).map((r) => r.entity_id!);
    const assetIds = rows.filter((r) => r.entity_type === "asset" && r.entity_id).map((r) => r.entity_id!);

    const [docsResult, assetsResult] = await Promise.all([
      docIds.length > 0
        ? supabase.from("documents").select("id, title, icon").in("id", docIds)
        : Promise.resolve({ data: [] }),
      assetIds.length > 0
        ? supabase.from("assets").select("id, name, type").in("id", assetIds)
        : Promise.resolve({ data: [] }),
    ]);

    const docMap = new Map((docsResult.data ?? []).map((d: { id: string; title: string; icon: string | null }) => [d.id, d]));
    const assetMap = new Map((assetsResult.data ?? []).map((a: { id: string; name: string; type: string }) => [a.id, a]));

    const resolved: TaskAttachment[] = rows.map((row) => {
      const attachment: TaskAttachment = row as TaskAttachment;
      if (row.entity_type === "document" && row.entity_id) {
        const doc = docMap.get(row.entity_id);
        if (doc) {
          attachment.resolved_name = doc.title;
          attachment.resolved_icon = doc.icon ?? undefined;
        }
      } else if (row.entity_type === "asset" && row.entity_id) {
        const asset = assetMap.get(row.entity_id);
        if (asset) {
          attachment.resolved_name = asset.name;
          attachment.resolved_asset_type = asset.type;
        }
      }
      return attachment;
    });

    setAttachments(resolved);
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAttachments();
  }, [fetchAttachments]);

  async function addAttachment(input: AddAttachmentInput) {
    const payload: Record<string, unknown> = {
      task_id: taskId,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      url: input.url ?? null,
      label: input.label ?? null,
      added_by: "human",
    };

    const { data: inserted, error } = await supabase
      .from("task_attachments")
      .insert(payload)
      .select("id")
      .single();

    if (!error && inserted) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "task_attachment",
        entity_id: inserted.id,
        action: "created",
        summary: `Attached ${input.entity_type} to task`,
      });
      fetchAttachments();
    }
    return { error };
  }

  async function removeAttachment(attachmentId: string) {
    await supabase.from("task_attachments").delete().eq("id", attachmentId);
    logAudit(supabase, {
      module: "tasks",
      entity_type: "task_attachment",
      entity_id: attachmentId,
      action: "deleted",
      summary: `Removed attachment from task`,
    });
    fetchAttachments();
  }

  async function attachNewAsset(assetId: string) {
    // Convenience: fetch asset name, then attach
    const { data: asset } = await supabase
      .from("assets")
      .select("name")
      .eq("id", assetId)
      .single();

    return addAttachment({
      entity_type: "asset",
      entity_id: assetId,
      label: asset?.name ?? undefined,
    });
  }

  async function searchEntities(query: string): Promise<SearchResult[]> {
    if (!query.trim()) return [];
    const q = `%${query.trim()}%`;

    const [docsResult, assetsResult] = await Promise.all([
      supabase
        .from("documents")
        .select("id, title, icon")
        .ilike("title", q)
        .limit(5),
      supabase
        .from("assets")
        .select("id, name, type")
        .ilike("name", q)
        .limit(5),
    ]);

    const results: SearchResult[] = [];

    for (const doc of docsResult.data ?? []) {
      results.push({
        id: doc.id,
        name: doc.title,
        type: "document",
        icon: doc.icon ?? undefined,
      });
    }

    for (const asset of assetsResult.data ?? []) {
      results.push({
        id: asset.id,
        name: asset.name,
        type: "asset",
        asset_type: asset.type,
      });
    }

    return results;
  }

  return {
    attachments,
    loading,
    actions: {
      addAttachment,
      removeAttachment,
      attachNewAsset,
      searchEntities,
      fetchAttachments,
    },
  };
}
