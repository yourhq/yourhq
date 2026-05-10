"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AgentFleetItem, CommandQueueStats } from "@/lib/types/dashboard";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<string, string> = {
  ready: "var(--status-success)",
  error: "var(--status-error)",
  paused: "var(--status-warning)",
  provisioning: "var(--status-warning)",
  hibernating: "var(--status-neutral)",
};

export function AgentFleetCard({
  agents,
  commandQueue,
}: {
  agents: AgentFleetItem[];
  commandQueue: CommandQueueStats;
}) {
  const [skillsLearned, setSkillsLearned] = useState<number | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    async function fetchSkillMetric() {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const { count } = await supabase
        .from("audit_log")
        .select("entity_id", { count: "exact", head: true })
        .eq("actor_type", "agent")
        .eq("module", "knowledge")
        .in("action", ["created", "updated"])
        .gte("created_at", cutoff.toISOString());
      setSkillsLearned(count ?? 0);
    }
    if (agents.length > 0) fetchSkillMetric();
  }, [supabase, agents.length]);
  const hasQueueActivity =
    commandQueue.pending > 0 || commandQueue.running > 0;

  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-heading">Agents</h2>
        <Link
          href="/dashboard/agents"
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          View all{agents.length > 0 ? ` ${agents.length}` : ""}
        </Link>
      </div>

      {agents.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-body text-muted-foreground">
            No agents yet.
          </p>
          <Link
            href="/dashboard/agents"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition-colors hover:bg-foreground/90"
          >
            Create your first agent
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {agents.slice(0, 8).map((agent) => {
            const color = STATUS_COLOR[agent.status] ?? "var(--status-neutral)";
            return (
              <li key={agent.id}>
                <Link
                  href={`/dashboard/agents/${agent.slug}`}
                  className="group flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-muted/30"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      agent.status === "ready" && "animate-pulse"
                    )}
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                    {agent.name}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {agent.last_seen_at
                      ? formatDistanceToNow(new Date(agent.last_seen_at), {
                          addSuffix: true,
                        })
                      : "never"}
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {(hasQueueActivity || (skillsLearned != null && skillsLearned > 0)) && (
        <div className="mt-3 border-t border-border/40 pt-3 text-[11px] text-muted-foreground space-y-1">
          {hasQueueActivity && (
            <div>
              Commands:{" "}
              {commandQueue.pending > 0 && (
                <span>{commandQueue.pending} pending</span>
              )}
              {commandQueue.pending > 0 && commandQueue.running > 0 && (
                <span> · </span>
              )}
              {commandQueue.running > 0 && (
                <span>{commandQueue.running} running</span>
              )}
            </div>
          )}
          {skillsLearned != null && skillsLearned > 0 && (
            <Link
              href="/dashboard/activity?module=knowledge&actor=agent"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <BookOpen className="h-3 w-3" />
              {skillsLearned} skill{skillsLearned !== 1 ? "s" : ""} learned this week
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
