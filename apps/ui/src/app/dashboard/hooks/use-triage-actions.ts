"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { TriageItem } from "@/lib/types/dashboard";
import {
  approveDeliverable,
  requestDeliverableRevision,
  retryFailedInboxItem,
  snoozeFollowUp,
  dismissTriageNotification,
} from "../actions/triage";

export function useTriageActions(initialItems: TriageItem[]) {
  const [items, setItems] = useState(initialItems);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Sync when parent re-fetches
  const resetItems = useCallback((newItems: TriageItem[]) => {
    setItems(newItems);
  }, []);

  const handleAction = useCallback(
    async (itemId: string, actionKey: string) => {
      if (actionKey === "view") return;

      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      // Optimistic removal
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setLoadingId(itemId);

      let result: { ok: boolean; error?: string } = { ok: false, error: "Unknown action" };

      try {
        switch (actionKey) {
          case "approve":
            result = await approveDeliverable(item.entityId);
            break;
          case "revise":
            result = await requestDeliverableRevision(item.entityId, "");
            break;
          case "retry":
            result = await retryFailedInboxItem(item.entityId);
            break;
          case "snooze": {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            result = await snoozeFollowUp(
              item.entityId,
              tomorrow.toISOString().split("T")[0],
            );
            break;
          }
          case "dismiss":
            if (item.entityType === "notification") {
              result = await dismissTriageNotification(item.entityId);
            } else {
              // For failed work items, just remove from view
              result = { ok: true };
            }
            break;
          default:
            result = { ok: true };
        }
      } catch {
        result = { ok: false, error: "Network error" };
      }

      if (!result.ok) {
        // Rollback: restore the item
        setItems((prev) => {
          const restored = [...prev, item].sort(
            (a, b) => a.urgency - b.urgency,
          );
          return restored;
        });
        toast.error(result.error ?? "Action failed");
      }

      setLoadingId(null);
    },
    [items],
  );

  return { items, handleAction, resetItems, loadingId };
}
