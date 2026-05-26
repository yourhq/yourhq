"use client";

import { useEffect, useState } from "react";
import { X, FileCheck, AlertOctagon, UserPlus, BookOpen, CreditCard } from "lucide-react";
import type { BriefingSummary } from "@/lib/types/dashboard";
import {
  getLastDashboardVisit,
  setLastDashboardVisit,
  shouldShowBriefing,
} from "@/lib/dashboard/last-visit";
import { fetchBriefing } from "../actions/briefing";
import { cn } from "@/lib/utils";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timePeriodLabel(since: string): string {
  const gap = Date.now() - new Date(since).getTime();
  const hours = Math.round(gap / (1000 * 60 * 60));
  if (hours < 24) return `the last ${hours} hours`;
  const days = Math.round(gap / (1000 * 60 * 60 * 24));
  return days === 1 ? "yesterday" : `the last ${days} days`;
}

function hasAnythingToShow(data: BriefingSummary): boolean {
  return (
    data.agentUpdates.length > 0 ||
    data.deliverablesAwaitingReview > 0 ||
    data.failedItems > 0 ||
    data.spendSinceUsd > 0 ||
    data.newContacts > 0 ||
    data.skillsLearned > 0
  );
}

function formatTaskList(titles: string[]): string {
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles[0]}, ${titles[1]}, and ${titles.length - 2} more`;
}

export function BriefingBar() {
  const [data, setData] = useState<BriefingSummary | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!shouldShowBriefing()) {
      if (!getLastDashboardVisit()) setLastDashboardVisit();
      return;
    }

    const since = getLastDashboardVisit()!;
    let cancelled = false;

    fetchBriefing(since).then((result) => {
      if (cancelled) return;
      if (hasAnythingToShow(result)) {
        setData(result);
      }
      setLastDashboardVisit();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || dismissed) return null;

  const name = data.ownerPreferredName;
  const greetingText = name ? `${greeting()}, ${name}` : greeting();

  const notices: { icon: typeof FileCheck; iconColor: string; text: string }[] = [];
  if (data.deliverablesAwaitingReview > 0)
    notices.push({
      icon: FileCheck,
      iconColor: "text-[var(--status-info)]",
      text: `${data.deliverablesAwaitingReview} deliverable${data.deliverablesAwaitingReview !== 1 ? "s" : ""} awaiting your review`,
    });
  if (data.failedItems > 0)
    notices.push({
      icon: AlertOctagon,
      iconColor: "text-[var(--status-error)]",
      text: `${data.failedItems} work item${data.failedItems !== 1 ? "s" : ""} failed`,
    });
  if (data.newContacts > 0)
    notices.push({
      icon: UserPlus,
      iconColor: "text-muted-foreground/60",
      text: `${data.newContacts} new contact${data.newContacts !== 1 ? "s" : ""} added`,
    });
  if (data.skillsLearned > 0)
    notices.push({
      icon: BookOpen,
      iconColor: "text-muted-foreground/60",
      text: `${data.skillsLearned} skill${data.skillsLearned !== 1 ? "s" : ""} learned`,
    });
  if (data.spendSinceUsd > 0)
    notices.push({
      icon: CreditCard,
      iconColor: "text-muted-foreground/60",
      text: `$${data.spendSinceUsd.toFixed(2)} spent`,
    });

  return (
    <section className="group relative rounded-xl border border-primary/12 bg-primary/[0.025] dark:bg-primary/[0.05] overflow-hidden">
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 z-10 rounded-md p-0.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 hover:!text-muted-foreground transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="px-5 py-4">
        <p className="text-[15px] font-semibold text-foreground tracking-tight">
          {greetingText}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/45">
          Here&rsquo;s what happened in {timePeriodLabel(data.since)}
        </p>
      </div>

      {data.agentUpdates.length > 0 && (
        <div className="border-t border-primary/8 divide-y divide-primary/6">
          {data.agentUpdates.map((update, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/[0.05] dark:bg-primary/[0.08] text-[13px] leading-none shrink-0 mt-0.5">
                {update.agentEmoji ?? "🤖"}
              </span>
              <p className="text-[12px] text-muted-foreground/70 leading-relaxed pt-0.5">
                <span className="font-semibold text-foreground/80">{update.agentName}</span>
                {" completed "}
                <span className="text-foreground/70">{formatTaskList(update.taskTitles)}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {notices.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3",
            data.agentUpdates.length > 0
              ? "border-t border-primary/8 bg-primary/[0.015] dark:bg-primary/[0.03]"
              : "border-t border-primary/8",
          )}
        >
          {notices.map((n, i) => {
            const Icon = n.icon;
            return (
              <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/55">
                <Icon className={cn("h-3 w-3 shrink-0", n.iconColor)} />
                {n.text}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
