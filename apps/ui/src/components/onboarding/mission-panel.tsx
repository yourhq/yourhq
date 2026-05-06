"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronUp, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";
import { tier1Count, tier2Count } from "@/lib/onboarding/progress";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface MissionItem {
  key: string;
  label: string;
  description: string;
  href: string;
  tier: 1 | 2;
}

const TIER1_ITEMS: MissionItem[] = [
  { key: "agentCreated", label: "Create your first agent", description: "Go to Agents to create one", href: "/dashboard/agents", tier: 1 },
  { key: "taskAssigned", label: "Assign a task to an agent", description: "Create a task and assign it", href: "/dashboard/tasks", tier: 1 },
  { key: "agentWorked", label: "Agent completes work", description: "Wait for your agent to finish a task", href: "/dashboard/tasks", tier: 1 },
  { key: "knowledgeCreated", label: "Add knowledge", description: "Give your agents context to work with", href: "/dashboard/knowledge", tier: 1 },
  { key: "dashboardExplored", label: "Explore the dashboard", description: "Visit a few different pages", href: "/dashboard", tier: 1 },
];

const TIER2_ITEMS: MissionItem[] = [
  { key: "sourceConnected", label: "Connect a source", description: "Pull in data from Notion or Google Drive", href: "/dashboard/knowledge", tier: 2 },
  { key: "routineCreated", label: "Create a routine", description: "Automate recurring agent work", href: "/dashboard/routines", tier: 2 },
  { key: "desktopViewed", label: "View agent desktop", description: "See what your agent sees in the browser", href: "/dashboard/agents", tier: 2 },
  { key: "secondAgentCreated", label: "Add a second agent", description: "Build your AI workforce", href: "/dashboard/agents", tier: 2 },
];

function MissionContent({
  items,
  tierData,
  counts,
  showTier2,
  progressPercent,
  onDismiss,
}: {
  items: MissionItem[];
  tierData: Record<string, boolean>;
  counts: { done: number; total: number };
  showTier2: boolean;
  progressPercent: number;
  onDismiss: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold tracking-tight">
            {showTier2 ? "Go further" : "Getting started"}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {counts.done}/{counts.total}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
          aria-label="Dismiss getting started"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mx-4 h-1 overflow-hidden rounded-full bg-border/50">
        <div
          className="h-full rounded-full bg-foreground transition-all duration-700 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Items */}
      <div className="p-2 pt-3 space-y-0.5">
        {items.map((item) => {
          const done = tierData[item.key];
          return (
            <div
              key={item.key}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
                done ? "text-muted-foreground" : "text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-all duration-300",
                  done
                    ? "bg-green-500 text-white"
                    : "border-[1.5px] border-border",
                )}
              >
                {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn(done && "line-through decoration-muted-foreground/40")}>{item.label}</span>
                {!done && (
                  <p className="text-[11px] text-muted-foreground/60 leading-tight mt-0.5 hidden group-hover:block">
                    {item.description}
                  </p>
                )}
              </div>
              {!done && (
                <Link
                  href={item.href}
                  className="text-muted-foreground/60 hover:text-foreground transition-colors"
                  aria-label={`Go to ${item.label}`}
                >
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/40">
        <button
          onClick={onDismiss}
          className="text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          Don&apos;t show again
        </button>
      </div>
    </>
  );
}

export function MissionPanel() {
  const { progress, dismiss, isTier1Done } = useOnboardingProgress();
  const [expanded, setExpanded] = useState(true);

  if (!progress.wizardCompleted || progress.dismissedAt) return null;

  const showTier2 = isTier1Done;
  const items = showTier2 ? TIER2_ITEMS : TIER1_ITEMS;
  const counts = showTier2 ? tier2Count(progress) : tier1Count(progress);
  const tierData = (showTier2 ? progress.tier2 : progress.tier1) as Record<string, boolean>;

  if (counts.done === counts.total && showTier2) return null;

  const progressPercent = Math.round((counts.done / counts.total) * 100);

  return (
    <>
      {/* Desktop: fixed card (md+) */}
      <div
        className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500 hidden md:block"
        style={{ width: expanded ? 280 : "auto" }}
      >
        <div
          className={cn(
            "rounded-xl border border-border/60 bg-card shadow-lg transition-all duration-300 ease-out overflow-hidden",
            !expanded && "rounded-full",
          )}
        >
          {expanded ? (
            <>
              <MissionContent
                items={items}
                tierData={tierData}
                counts={counts}
                showTier2={showTier2}
                progressPercent={progressPercent}
                onDismiss={dismiss}
              />
              <div className="px-4 pb-2">
                <button
                  onClick={() => setExpanded(false)}
                  className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Minimize
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setExpanded(true)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-accent/30"
              aria-label={`Getting started: ${counts.done} of ${counts.total} complete`}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0">
                <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="text-border/60" />
                <circle
                  cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-foreground"
                  strokeDasharray={`${progressPercent * 0.44} 44`}
                  strokeLinecap="round"
                  transform="rotate(-90 9 9)"
                />
              </svg>
              <span className="text-muted-foreground tabular-nums">{counts.done}/{counts.total}</span>
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile: bottom sheet (<md) */}
      <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
        <Drawer>
          <DrawerTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-4 py-2 shadow-lg text-[13px] font-medium transition-colors hover:bg-accent/30"
              aria-label={`Getting started: ${counts.done} of ${counts.total} complete`}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" className="shrink-0">
                <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2" className="text-border/60" />
                <circle
                  cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-foreground"
                  strokeDasharray={`${progressPercent * 0.44} 44`}
                  strokeLinecap="round"
                  transform="rotate(-90 9 9)"
                />
              </svg>
              <span className="text-muted-foreground tabular-nums">{counts.done}/{counts.total}</span>
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            </button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="pb-6">
              <MissionContent
                items={items}
                tierData={tierData}
                counts={counts}
                showTier2={showTier2}
                progressPercent={progressPercent}
                onDismiss={dismiss}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
