"use client";

import { X, Lightbulb } from "lucide-react";
import Link from "next/link";
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

  if (!progress.wizardCompleted) return null;
  if (progress.dismissedAt) return null;
  if (progress.pagesVisited.includes(pageKey)) return null;

  return (
    <div className="mx-auto mb-4 flex items-start gap-3 rounded-lg border border-border/60 bg-accent/30 px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="text-[12px] text-muted-foreground">{description}</p>
        {ctaLabel && ctaTarget && (
          <Link
            href={ctaTarget}
            className="inline-block mt-1 text-[12px] font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            {ctaLabel}
          </Link>
        )}
      </div>
      <button
        onClick={() => markPageVisited(pageKey)}
        className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
