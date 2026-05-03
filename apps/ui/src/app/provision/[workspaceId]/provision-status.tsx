"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { pollProvisionAction } from "./actions";

interface Stage {
  key: string;
  label: string;
}

const STAGES: Stage[] = [
  { key: "creating_project", label: "Creating database" },
  { key: "applying_schema", label: "Applying schema" },
  { key: "creating_user", label: "Setting up your workspace" },
  { key: "starting_sandbox", label: "Starting agent runtime" },
  { key: "waiting_for_gateway", label: "Connecting gateway" },
  { key: "complete", label: "Ready" },
];

const STAGE_MAP: Record<string, number> = {
  creating_project: 0,
  waiting_for_project: 0,
  fetching_keys: 0,
  applying_schema: 1,
  creating_user: 2,
  starting_sandbox: 3,
  waiting_for_gateway: 4,
  complete: 5,
};

function stageIndex(stage: string | null): number {
  if (!stage) return -1;
  return STAGE_MAP[stage] ?? -1;
}

export function ProvisionStatus({ workspaceId }: { workspaceId: string }) {
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const poll = useCallback(async () => {
    const status = await pollProvisionAction(workspaceId);
    if (!status) return;
    if (status.provision_error) {
      setError(status.provision_error);
      return;
    }
    setCurrentStage(status.provision_stage);
  }, [workspaceId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [poll]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const current = stageIndex(currentStage);
  const isComplete = currentStage === "complete";

  useEffect(() => {
    if (!isComplete) return;
    const timer = setTimeout(() => router.push("/login"), 4000);
    return () => clearTimeout(timer);
  }, [isComplete, router]);

  const progressPercent = isComplete
    ? 100
    : current >= 0
      ? Math.round(((current + 0.5) / STAGES.length) * 100)
      : 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[420px]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition-colors duration-500",
              isComplete
                ? "bg-green-500/10 text-green-600"
                : "bg-foreground text-background",
            )}
          >
            {isComplete ? (
              <Check className="h-[18px] w-[18px]" />
            ) : (
              <Sparkles className="h-[18px] w-[18px]" />
            )}
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
              {isComplete ? "Your workspace is ready" : "Setting up your workspace"}
            </h1>
            <p className="text-[13px] text-muted-foreground">
              {isComplete
                ? "Redirecting you to sign in…"
                : "This usually takes about a minute."}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-[3px] overflow-hidden rounded-full bg-border/60">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              isComplete ? "bg-green-500" : "bg-foreground",
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Stages card */}
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {error ? (
            <div className="p-6">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 space-y-1">
                  <p className="text-[13px] font-medium text-destructive">
                    Something went wrong
                  </p>
                  <p className="text-[12px] text-destructive/80">{error}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {STAGES.map((stage, i) => {
                const done = i < current || isComplete;
                const active = i === current && !isComplete;
                return (
                  <div
                    key={stage.key}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 transition-colors duration-300",
                      active && "bg-accent/30",
                    )}
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {done ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10">
                          <Check className="h-3 w-3 text-green-600" />
                        </div>
                      ) : active ? (
                        <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-border" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[13px] transition-colors duration-300",
                        done
                          ? "text-muted-foreground"
                          : active
                            ? "text-foreground font-medium"
                            : "text-muted-foreground/40",
                      )}
                    >
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA when complete */}
        {isComplete && (
          <button
            onClick={() => router.push("/login")}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-foreground text-[13px] font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.98]"
          >
            Sign in to your workspace
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
