"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, LayoutDashboard, Loader2, RefreshCw } from "lucide-react";
import { fetchDashboardStats } from "./actions";
import type { DashboardStats } from "@/lib/types/dashboard";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ActivityItem } from "@/components/activity/activity-item";

import { AlertBanner } from "./components/alert-banner";
import { StatStrip } from "./components/stat-strip";
import { NeedsAttention } from "./components/needs-attention";
import { AgentFleetCard } from "./components/agent-fleet-card";
import { InfraCard } from "./components/infra-card";
import { PipelineCard } from "./components/pipeline-card";
import { TasksCard } from "./components/tasks-card";
import { SpendCard } from "./components/spend-card";

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
            ? `Updated ${formatDistanceToNow(new Date(stats.fetchedAt), { addSuffix: true })}`
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
          {/* Loading skeleton */}
          {loading && !stats && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error state */}
          {error && !stats && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--status-error)]/40 bg-[var(--status-error)]/5 p-4 text-body text-[var(--status-error)]">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {stats && (
            <div className="space-y-5">
              {/* Zone 1: Alert banner */}
              <AlertBanner alerts={stats.alerts} />

              {/* Zone 2: Stat strip */}
              <StatStrip stats={stats} />

              {/* Zone 3: Card grid */}
              <div className="space-y-4">
                {/* Row 1: Needs attention (full width) */}
                <NeedsAttention items={stats.actionItems} />

                {/* Row 2: Agents + Infrastructure */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <AgentFleetCard
                    agents={stats.agentFleet}
                    commandQueue={stats.commandQueue}
                  />
                  <InfraCard
                    gateways={stats.gateways}
                    commandQueue={stats.commandQueue}
                    inboxQueue={stats.inboxQueue}
                  />
                </div>

                {/* Row 3: Pipeline + Tasks */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <PipelineCard crm={stats.crm} />
                  <TasksCard tasks={stats.tasks} />
                </div>

                {/* Row 4: Spend (full width) */}
                <SpendCard spend={stats.spend} />

                {/* Row 5: Recent activity (full width) */}
                <section className="rounded-md border border-border/60 bg-card p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-heading">Recent activity</h2>
                    <Link
                      href="/dashboard/activity"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      View all
                    </Link>
                  </div>
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
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
