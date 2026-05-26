"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, LayoutDashboard, Loader2, RefreshCw } from "lucide-react";
import { fetchAgentFleetEnriched } from "./actions/fleet";
import { fetchTriageItems } from "./actions/triage";
import { fetchWorkspacePulse } from "./actions/pulse";
import type {
  AgentFleetEnriched,
  TriageItem,
  WorkspacePulseData,
} from "@/lib/types/dashboard";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

import { FirstVisitHint } from "@/components/onboarding/first-visit-hint";
import { AgentFleetGrid } from "./components/agent-fleet-grid";
import { TriageQueue } from "./components/triage-queue";
import { WorkspacePulse } from "./components/workspace-pulse";
import { ActivityStream } from "./components/activity-stream";
import { BriefingBar } from "./components/briefing-bar";

export default function DashboardPage() {
  const [fleet, setFleet] = useState<AgentFleetEnriched[]>([]);
  const [triageItems, setTriageItems] = useState<TriageItem[]>([]);
  const [pulseData, setPulseData] = useState<WorkspacePulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fleetData, triage, pulse] = await Promise.all([
        fetchAgentFleetEnriched(),
        fetchTriageItems(),
        fetchWorkspacePulse(),
      ]);
      setFleet(fleetData);
      setTriageItems(triage);
      setPulseData(pulse);
      setFetchedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loaded = fetchedAt !== null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<LayoutDashboard className="h-4 w-4" />}
        title="Dashboard"
        primaryAction={
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="h-7 text-muted-foreground/60 hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3 w-3" />
            )}
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-5xl px-5 pb-8 pt-4">
          <FirstVisitHint
            pageKey="dashboard"
            title="Welcome to your command center"
            description="This is your workspace overview — agent activity, tasks, and key metrics at a glance."
          />

          {loading && !loaded && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
            </div>
          )}

          {error && !loaded && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--status-error)]/20 bg-[var(--status-error)]/5 px-4 py-3 text-[13px] text-[var(--status-error)]">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {loaded && (
            <div className="space-y-5">
              <BriefingBar />
              <AgentFleetGrid agents={fleet} />
              <TriageQueue initialItems={triageItems} />
              {pulseData && <WorkspacePulse data={pulseData} />}
              <ActivityStream />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
