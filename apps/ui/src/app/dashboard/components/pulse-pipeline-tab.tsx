"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CrmStats, PipelineStageCount } from "@/lib/types/dashboard";

function PipelineBar({ stages }: { stages: PipelineStageCount[] }) {
  const nonTerminal = stages.filter((s) => !s.is_terminal);
  const total = nonTerminal.reduce((s, p) => s + p.count, 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
        {nonTerminal.map((s) => {
          const pct = (s.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={s.stage_key}
              className="h-full transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: s.color ?? "var(--status-neutral)",
              }}
            />
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {nonTerminal.map((s) => (
          <div key={s.stage_key} className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: s.color ?? "var(--status-neutral)",
              }}
            />
            <span className="text-[11px] text-muted-foreground/70">
              {s.label}
            </span>
            <span className="text-[11px] tabular-nums font-medium">
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PulsePipelineTab({ crm }: { crm: CrmStats }) {
  const terminal = crm.pipeline.filter((s) => s.is_terminal);

  return (
    <div>
      {/* Headline stats */}
      <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <div>
          <span className="text-xl font-semibold tabular-nums">{crm.totalContacts}</span>
          <span className="ml-1.5 text-[11px] text-muted-foreground/70">contacts</span>
        </div>
        {crm.contactsAddedThisWeek > 0 && (
          <span className="text-[12px]">
            <span className="font-medium tabular-nums text-[var(--status-success)]">
              +{crm.contactsAddedThisWeek}
            </span>{" "}
            <span className="text-muted-foreground/70">this week</span>
          </span>
        )}
        <span className="text-[12px]">
          <span className="font-medium tabular-nums">
            {crm.interactionsThisWeek}
          </span>{" "}
          <span className="text-muted-foreground/70">interactions/wk</span>
        </span>
      </div>

      <PipelineBar stages={crm.pipeline} />

      {terminal.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/30 pt-2.5">
          {terminal.map((s) => (
            <span
              key={s.stage_key}
              className="text-[11px] text-muted-foreground/60"
            >
              {s.label}: <span className="tabular-nums">{s.count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Link
          href="/dashboard/crm"
          className="group flex items-center gap-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          View CRM
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
