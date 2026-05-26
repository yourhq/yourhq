"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { TriageItem } from "@/lib/types/dashboard";
import { useTriageActions } from "../hooks/use-triage-actions";
import { TriageItemRow } from "./triage-item-row";

export function TriageQueue({
  initialItems,
}: {
  initialItems: TriageItem[];
}) {
  const { items, handleAction, resetItems, loadingId } =
    useTriageActions(initialItems);

  useEffect(() => {
    resetItems(initialItems);
  }, [initialItems, resetItems]);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-border/30 bg-card/40 px-4 py-3">
        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success)]/50" />
        <p className="text-[12px] text-muted-foreground/50">
          All clear — nothing needs your attention
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/30">
        <AlertCircle className="h-3.5 w-3.5 text-[var(--status-warning)]" />
        <h2 className="text-[12px] font-semibold text-foreground/80">
          Needs your input
        </h2>
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--status-warning)]/10 px-1 text-[10px] font-semibold tabular-nums text-[var(--status-warning)]">
          {items.length}
        </span>
      </div>

      <ul className="divide-y divide-border/20">
        {items.map((item) => (
          <TriageItemRow
            key={item.id}
            item={item}
            onAction={handleAction}
            loading={loadingId === item.id}
          />
        ))}
      </ul>
    </section>
  );
}
