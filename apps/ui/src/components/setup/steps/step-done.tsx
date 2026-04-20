"use client";

import { Loader2, AlertCircle } from "lucide-react";

interface Props {
  submitting: boolean;
  submitted: boolean;
  error: string | null;
  workspaceName: string;
  stageCount: number;
  fieldCount: number;
  streamCount: number;
  onGoToDashboard: () => void;
  onRetry: () => void;
}

export function StepDone({
  submitting,
  submitted,
  error,
  workspaceName,
  stageCount,
  fieldCount,
  streamCount,
  onGoToDashboard,
  onRetry,
}: Props) {
  if (submitting) {
    return (
      <div className="flex flex-col items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          Setting up your workspace&hellip;
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-16">
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!submitted) return null;

  return (
    <div className="py-8">
      <div className="mb-6">
        <h1 className="text-[15px] font-semibold text-foreground">
          {workspaceName || "Your workspace"} is ready
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Here&apos;s what was set up.
        </p>
      </div>

      <div className="space-y-1 mb-6">
        <div className="flex h-9 items-center justify-between rounded-md border border-border/30 bg-muted/20 px-3 text-sm">
          <span className="text-muted-foreground">Pipeline stages</span>
          <span className="font-medium text-foreground">{stageCount}</span>
        </div>
        <div className="flex h-9 items-center justify-between rounded-md border border-border/30 bg-muted/20 px-3 text-sm">
          <span className="text-muted-foreground">Custom fields</span>
          <span className="font-medium text-foreground">{fieldCount}</span>
        </div>
        <div className="flex h-9 items-center justify-between rounded-md border border-border/30 bg-muted/20 px-3 text-sm">
          <span className="text-muted-foreground">Task streams</span>
          <span className="font-medium text-foreground">{streamCount}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onGoToDashboard}
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        Go to dashboard
      </button>
    </div>
  );
}
