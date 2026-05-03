"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";
import { tier1Count, tier2Count, isTier1Complete } from "@/lib/onboarding/progress";

interface MissionItem {
  key: string;
  label: string;
  href: string;
  tier: 1 | 2;
}

const TIER1_ITEMS: MissionItem[] = [
  { key: "agentCreated", label: "Create your first agent", href: "/dashboard/agents", tier: 1 },
  { key: "taskAssigned", label: "Assign a task to an agent", href: "/dashboard/tasks", tier: 1 },
  { key: "agentWorked", label: "Agent completes work", href: "/dashboard/tasks", tier: 1 },
  { key: "knowledgeCreated", label: "Add knowledge", href: "/dashboard/knowledge", tier: 1 },
  { key: "dashboardExplored", label: "Explore the dashboard", href: "/dashboard", tier: 1 },
];

const TIER2_ITEMS: MissionItem[] = [
  { key: "sourceConnected", label: "Connect a source", href: "/dashboard/knowledge", tier: 2 },
  { key: "routineCreated", label: "Create a routine", href: "/dashboard/routines", tier: 2 },
  { key: "desktopViewed", label: "View agent desktop", href: "/dashboard/agents", tier: 2 },
  { key: "secondAgentCreated", label: "Add a second agent", href: "/dashboard/agents", tier: 2 },
];

export function MissionPanel() {
  const { progress, dismiss, isTier1Done } = useOnboardingProgress();
  const [expanded, setExpanded] = useState(true);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Auto-collapse after 30s of no interaction
  useEffect(() => {
    if (!expanded) return;
    collapseTimer.current = setTimeout(() => setExpanded(false), 30000);
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current);
    };
  }, [expanded]);

  const resetCollapseTimer = () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = setTimeout(() => setExpanded(false), 30000);
  };

  if (!progress.wizardCompleted || progress.dismissedAt) return null;

  const showTier2 = isTier1Done;
  const items = showTier2 ? TIER2_ITEMS : TIER1_ITEMS;
  const counts = showTier2 ? tier2Count(progress) : tier1Count(progress);
  const tierData = showTier2 ? progress.tier2 : progress.tier1;

  if (counts.done === counts.total && showTier2) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 w-[280px] animate-in slide-in-from-right-4 fade-in duration-300"
      onMouseEnter={resetCollapseTimer}
    >
      {expanded ? (
        <div className="rounded-xl border border-border/60 bg-card shadow-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium">
                {showTier2 ? "Level up" : "Getting started"}
              </span>
              <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                {counts.done}/{counts.total}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setExpanded(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={dismiss}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-[2px] bg-border/40">
            <div
              className="h-full bg-foreground transition-all duration-500"
              style={{ width: `${(counts.done / counts.total) * 100}%` }}
            />
          </div>

          {/* Items */}
          <div className="p-2 space-y-0.5">
            {items.map((item) => {
              const done = (tierData as Record<string, boolean>)[item.key];
              return (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] transition-colors",
                    done ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                      done
                        ? "border-green-500/40 bg-green-500/10"
                        : "border-border",
                    )}
                  >
                    {done && <Check className="h-2.5 w-2.5 text-green-600" />}
                  </div>
                  <span className={cn("flex-1", done && "line-through")}>{item.label}</span>
                  {!done && (
                    <Link
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground transition-colors"
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
              onClick={dismiss}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              I&apos;ve got it — hide this
            </button>
          </div>
        </div>
      ) : (
        /* Collapsed pill */
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 rounded-full border border-border/60 bg-card px-3.5 py-2 shadow-lg text-[12px] font-medium transition-all hover:bg-accent/50 hover:shadow-md ml-auto"
        >
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background text-[10px] font-bold">
            {counts.done}
          </div>
          <span className="text-muted-foreground">/ {counts.total}</span>
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
