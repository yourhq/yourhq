"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EntityLink, ReviewStatus } from "@/lib/entity-links/types";
import { logAudit } from "@/lib/audit/log";
import { useRealtime } from "./use-realtime";

export function useDeliverables(taskId: string | null) {
  const [deliverables, setDeliverables] = useState<EntityLink[]>([]);
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  const fetchDeliverables = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);

    const { data: rows, error } = await supabase
      .from("entity_links")
      .select("*, submitted_by_agent:agents!entity_links_submitted_by_agent_id_fkey(id, name, slug)")
      .eq("owner_type", "task")
      .eq("owner_id", taskId)
      .eq("is_deliverable", true)
      .order("created_at", { ascending: true });

    if (error || !rows) {
      setLoading(false);
      return;
    }

    const knowledgeIds = rows
      .filter((r: Record<string, unknown>) => r.target_type === "knowledge_item" && r.target_id)
      .map((r: Record<string, unknown>) => r.target_id as string);

    let knowledgeMap = new Map<string, Record<string, unknown>>();
    if (knowledgeIds.length > 0) {
      const { data: items } = await supabase
        .from("knowledge_items")
        .select("id, title, kind, icon")
        .in("id", knowledgeIds);
      if (items) {
        knowledgeMap = new Map(items.map((k) => [k.id, k]));
      }
    }

    const resolved: EntityLink[] = rows.map((row: Record<string, unknown>) => {
      const link = row as unknown as EntityLink;
      if (link.target_type === "knowledge_item" && link.target_id) {
        const item = knowledgeMap.get(link.target_id);
        if (item) {
          link.resolved_name = item.title as string;
          link.resolved_icon = (item.icon as string) ?? undefined;
          link.resolved_extra = { kind: item.kind };
        }
      } else if (link.target_type === "url") {
        link.resolved_name = link.label ?? link.url ?? "URL";
      }
      return link;
    });

    setDeliverables(resolved);
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    fetchDeliverables();
  }, [fetchDeliverables]);

  useRealtime({
    table: "entity_links",
    event: "*",
    onPayload: (payload) => {
      const row = (payload.new ?? payload.old) as Record<string, unknown>;
      if (row?.owner_type === "task" && row?.owner_id === taskId && row?.is_deliverable) {
        fetchDeliverables();
      }
    },
    enabled: !!taskId,
  });

  async function updateReviewStatus(
    deliverableId: string,
    status: ReviewStatus,
    note?: string
  ) {
    const { error } = await supabase
      .from("entity_links")
      .update({
        review_status: status,
        review_note: note ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", deliverableId);

    if (!error) {
      logAudit(supabase, {
        module: "tasks",
        entity_type: "entity_link",
        entity_id: deliverableId,
        action: "updated",
        summary: `Deliverable review: ${status}`,
      });
      fetchDeliverables();
    }
    return { error };
  }

  async function approve(deliverableId: string) {
    return updateReviewStatus(deliverableId, "approved");
  }

  async function requestRevision(deliverableId: string, note: string) {
    return updateReviewStatus(deliverableId, "revision_requested", note);
  }

  async function reject(deliverableId: string, note: string) {
    return updateReviewStatus(deliverableId, "rejected", note);
  }

  return {
    deliverables,
    loading,
    actions: { approve, requestRevision, reject, fetchDeliverables },
  };
}
