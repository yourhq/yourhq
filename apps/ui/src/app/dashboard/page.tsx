"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import {
  AlertCircle,
  Loader2,
  CalendarClock,
  LayoutDashboard,
  RefreshCw,
} from "lucide-react";
import { fetchDashboardStats } from "./actions";
import type { DashboardStats, PipelineStageCount } from "@/lib/types/dashboard";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ActivityItem } from "@/components/activity/activity-item";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Inline stat ─────────────────────────────────────────────────────

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-[14px] font-semibold tabular-nums",
          warn && "text-[var(--status-error)]"
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ── Card wrapper ────────────────────────────────────────────────────

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border/60 bg-card p-5">
      <div className="mb-4">
        <h2 className="text-heading">{title}</h2>
        {description && (
          <p className="text-caption text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// ── Pipeline bar (dynamic, data-driven) ────────────────────────────

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
      {/* Segmented bar */}
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

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {nonTerminal.map((stage) => (
          <div key={stage.stage_key} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: stage.color ?? DEFAULT_STAGE_COLOR }}
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

      {/* Terminal stages */}
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

// ── Page ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<LayoutDashboard className="h-4 w-4" />}
        title="Dashboard"
        description={
          stats
            ? `Updated ${formatDistanceToNow(new Date(stats.fetchedAt), {
                addSuffix: true,
              })}`
            : "Loading workspace overview…"
        }
        primaryAction={
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-5xl p-5">
          {loading && !stats && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && !stats && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--status-error)]/40 bg-[var(--status-error)]/5 p-4 text-body text-[var(--status-error)]">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {stats && (
            <div className="grid gap-4 lg:grid-cols-2">
              {/* CRM Pipeline */}
              <Card
                title="Pipeline"
                description="Contacts distributed by stage."
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <Stat
                      label="Total"
                      value={fmt(stats.crm.totalContacts)}
                    />
                    <Stat
                      label="Added this week"
                      value={`+${fmt(stats.crm.contactsAddedThisWeek)}`}
                    />
                    <Stat
                      label="Follow-ups due"
                      value={fmt(stats.crm.followupsDue)}
                      warn={stats.crm.followupsDue > 0}
                    />
                    <Stat
                      label="Interactions / week"
                      value={fmt(stats.crm.interactionsThisWeek)}
                    />
                  </div>
                  <PipelineBar pipeline={stats.crm.pipeline} />
                </div>
              </Card>

              {/* Tasks */}
              <Card title="Tasks" description="Work in flight across streams.">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <TaskStat
                      color="var(--status-neutral)"
                      label="Todo"
                      value={stats.tasks.todo}
                    />
                    <TaskStat
                      color="var(--status-info)"
                      label="In progress"
                      value={stats.tasks.inProgress}
                    />
                    <TaskStat
                      color="var(--status-error)"
                      label="Blocked"
                      value={stats.tasks.blocked}
                    />
                    <TaskStat
                      color="var(--status-success)"
                      label="Done"
                      value={stats.tasks.done}
                    />
                  </div>
                  {stats.tasks.overdue > 0 && (
                    <p className="flex items-center gap-1 text-body text-[var(--status-error)]">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {stats.tasks.overdue} overdue
                    </p>
                  )}
                </div>
              </Card>

              {/* Agents */}
              <Card title="Agents" description="Registered agents and recent activity.">
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <TaskStat
                    color="var(--status-success)"
                    label="Online"
                    value={`${stats.agents.online}/${stats.agents.total}`}
                  />
                  <TaskStat
                    color="var(--status-error)"
                    label="Error"
                    value={stats.agents.error}
                  />
                  <Stat
                    label="Actions (24h)"
                    value={fmt(stats.agents.recentActions)}
                  />
                </div>
              </Card>

              {/* Usage */}
              <Card title="Usage" description="LLM spend across all agents this month.">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    <Stat
                      label="Spend"
                      value={`$${stats.fleetUsage.total_spend_usd.toFixed(2)}`}
                    />
                    <Stat
                      label="Tokens"
                      value={fmt(stats.fleetUsage.total_tokens)}
                    />
                    <Stat
                      label="Agents"
                      value={String(stats.fleetUsage.agent_count)}
                    />
                  </div>
                  {(stats.fleetUsage.warned_count > 0 ||
                    stats.fleetUsage.exceeded_count > 0 ||
                    stats.fleetUsage.unmetered_count > 0) && (
                    <div className="flex flex-wrap gap-x-4">
                      {stats.fleetUsage.warned_count > 0 && (
                        <TaskStat
                          color="var(--status-warning)"
                          label="Warned"
                          value={stats.fleetUsage.warned_count}
                        />
                      )}
                      {stats.fleetUsage.exceeded_count > 0 && (
                        <TaskStat
                          color="var(--status-error)"
                          label="Exceeded"
                          value={stats.fleetUsage.exceeded_count}
                        />
                      )}
                      {stats.fleetUsage.unmetered_count > 0 && (
                        <TaskStat
                          color="var(--status-neutral)"
                          label="Unmetered"
                          value={stats.fleetUsage.unmetered_count}
                        />
                      )}
                    </div>
                  )}
                </div>
              </Card>

              {/* Follow-ups Due */}
              <Card
                title="Follow-ups due"
                description="Interactions waiting on a next step."
              >
                {stats.followUps.length === 0 ? (
                  <p className="text-body text-muted-foreground">
                    Nothing due. Inbox zero.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/60">
                    {stats.followUps.map((f) => (
                      <li key={f.interaction_id}>
                        <Link
                          href={`/dashboard/contacts/${f.contact_id}`}
                          className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60"
                        >
                          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[var(--status-error)]" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-foreground">
                              {f.contact_name}
                            </div>
                            {f.next_action && (
                              <div className="truncate text-[11px] text-muted-foreground">
                                {f.next_action}
                              </div>
                            )}
                          </div>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {format(new Date(f.next_action_date), "MMM d")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Recent Activity */}
              <div className="lg:col-span-2">
                <Card title="Recent activity" description="The last few things that happened.">
                  {stats.recentActivity.length === 0 ? (
                    <p className="text-body text-muted-foreground">
                      No recent activity.
                    </p>
                  ) : (
                    <div>
                      {stats.recentActivity.map((entry) => (
                        <ActivityItem key={entry.id} entry={entry} />
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskStat({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}
