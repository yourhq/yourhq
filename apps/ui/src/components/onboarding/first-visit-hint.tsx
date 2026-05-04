"use client";

import { useState } from "react";
import { X, Lightbulb } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useOnboardingProgress } from "@/hooks/use-onboarding-progress";

interface FirstVisitHintProps {
  pageKey: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaTarget?: string;
}

export function FirstVisitHint({
  pageKey,
  title,
  description,
  ctaLabel,
  ctaTarget,
}: FirstVisitHintProps) {
  const { progress, markPageVisited } = useOnboardingProgress();
  const [dismissing, setDismissing] = useState(false);

  if (!progress.wizardCompleted) return null;
  if (progress.dismissedAt) return null;
  if (progress.pagesVisited.includes(pageKey)) return null;

  const handleDismiss = () => {
    setDismissing(true);
    setTimeout(() => markPageVisited(pageKey), 200);
  };

  return (
    <div
      className={cn(
        "mb-4 flex items-start gap-3 rounded-lg border-l-2 border-l-amber-500/60 border border-border/40 bg-card px-4 py-3 shadow-sm transition-all duration-200",
        dismissing ? "opacity-0 translate-x-2" : "animate-in fade-in slide-in-from-top-1 duration-300",
      )}
    >
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/80" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="text-[12px] text-muted-foreground leading-relaxed">{description}</p>
        {ctaLabel && ctaTarget && (
          <Link
            href={ctaTarget}
            className="inline-flex items-center gap-1 mt-1.5 text-[12px] font-medium text-foreground hover:text-foreground/80 transition-colors"
          >
            {ctaLabel} &rarr;
          </Link>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/60 transition-colors"
        aria-label="Dismiss hint"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
