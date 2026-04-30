import Link from "next/link";
import type { CrmStats, PipelineStageCount } from "@/lib/types/dashboard";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PipelineBar({ pipeline }: { pipeline: PipelineStageCount[] }) {
  const nonTerminal = pipeline.filter((p) => !p.is_terminal);
  const terminal = pipeline.filter((p) => p.is_terminal);
  const total = nonTerminal.reduce((sum, s) => sum + s.count, 0);

  if (pipeline.length === 0) {
    return (
      <p className="text-body text-muted-foreground">
        No pipeline stages configured.{" "}
        <Link
          href="/dashboard/settings/pipeline"
          className="underline hover:text-foreground"
        >
          Add stages
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {total > 0 && (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {nonTerminal.map((stage) => {
            if (stage.count === 0) return null;
            const pct = (stage.count / total) * 100;
            return (
              <div
                key={stage.stage_key}
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: stage.color ?? DEFAULT_STAGE_COLOR,
                }}
                title={`${stage.label}: ${stage.count}`}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {nonTerminal.map((stage) => (
          <div key={stage.stage_key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: stage.color ?? DEFAULT_STAGE_COLOR,
              }}
            />
            <span className="text-[11px] text-muted-foreground">
              {stage.label}
            </span>
            <span className="text-[11px] font-medium tabular-nums text-foreground">
              {stage.count}
            </span>
          </div>
        ))}
      </div>

      {terminal.length > 0 && (
        <div className="flex flex-wrap gap-x-4 border-t border-border/40 pt-3">
          {terminal.map((stage) => (
            <span
              key={stage.stage_key}
              className="text-[11px] text-muted-foreground"
            >
              {stage.label}:{" "}
              <span className="font-medium text-foreground">{stage.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PipelineCard({ crm }: { crm: CrmStats }) {
  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading">Pipeline</h2>
        <Link
          href="/dashboard/crm"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          CRM
        </Link>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-muted-foreground">Total</span>
            <span className="text-[14px] font-semibold tabular-nums">
              {fmt(crm.totalContacts)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-muted-foreground">
              This week
            </span>
            <span className="text-[14px] font-semibold tabular-nums">
              +{fmt(crm.contactsAddedThisWeek)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] text-muted-foreground">
              Interactions/wk
            </span>
            <span className="text-[14px] font-semibold tabular-nums">
              {fmt(crm.interactionsThisWeek)}
            </span>
          </div>
        </div>
        <PipelineBar pipeline={crm.pipeline} />
      </div>
    </section>
  );
}
